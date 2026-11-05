// ==========================================
// PConnect - Secure Admin Review API
// Conditional Updates | Testnet
// ==========================================

import crypto from "crypto";

const REQUEST_TIMEOUT = 10000;


/* ==========================================
   RESPONSE HELPER
========================================== */

function send(res, status, data) {
    return res.status(status).json(data);
}


/* ==========================================
   SECURITY HEADERS
========================================== */

function setSecurityHeaders(res) {

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
        "Pragma",
        "no-cache"
    );

    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    res.setHeader(
        "Vary",
        "x-admin-key"
    );
}


/* ==========================================
   ADMIN KEY VERIFICATION
========================================== */

function verifyAdminKey(providedKey, expectedKey) {

    if (
        typeof providedKey !== "string" ||
        typeof expectedKey !== "string" ||
        !providedKey ||
        !expectedKey ||
        providedKey.length > 4096 ||
        expectedKey.length > 4096
    ) {
        return false;
    }

    const provided =
        Buffer.from(providedKey, "utf8");

    const expected =
        Buffer.from(expectedKey, "utf8");

    if (provided.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        provided,
        expected
    );
}


/* ==========================================
   SUPABASE URL VALIDATION
========================================== */

function getSupabaseUrl(value) {

    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return null;
    }

    try {

        const url = new URL(value);

        if (
            url.protocol !== "https:" ||
            !/^[a-z0-9-]+\.supabase\.co$/i.test(
                url.hostname
            ) ||
            url.port ||
            url.pathname !== "/" ||
            url.search ||
            url.hash ||
            url.username ||
            url.password
        ) {
            return null;
        }

        return url.origin;

    } catch {

        return null;

    }
}


/* ==========================================
   FETCH JSON WITH TIMEOUT
   Timeout covers response body reading too.
========================================== */

async function fetchJson(url, options = {}) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {

        const response = await fetch(
            url,
            {
                ...options,
                signal: controller.signal
            }
        );

        const text = await response.text();

        let data = null;

        if (text) {

            try {

                data = JSON.parse(text);

            } catch {

                throw new Error(
                    "INVALID_SUPABASE_RESPONSE"
                );

            }

        }

        return {
            response,
            data
        };

    } finally {

        clearTimeout(timer);

    }
}


/* ==========================================
   MAIN HANDLER
========================================== */

export default async function handler(req, res) {

    setSecurityHeaders(res);

    if (req.method !== "POST") {

        res.setHeader("Allow", "POST");

        return send(res, 405, {
            success: false,
            error: "Method not allowed."
        });

    }

    try {

        /* ======================================
           ADMIN AUTHENTICATION
        ====================================== */

        const correctAdminKey =
            process.env.ADMIN_REVIEW_KEY;

        const providedAdminKey =
            req.headers["x-admin-key"];

        if (
            !verifyAdminKey(
                providedAdminKey,
                correctAdminKey
            )
        ) {

            if (!correctAdminKey) {

                console.error(
                    "ADMIN_REVIEW_KEY is not configured."
                );

                return send(res, 500, {
                    success: false,
                    error: "Server configuration error."
                });

            }

            return send(res, 401, {
                success: false,
                error: "Unauthorized admin access."
            });

        }


        /* ======================================
           INPUT VALIDATION
        ====================================== */

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {

            return send(res, 400, {
                success: false,
                error: "Invalid request body."
            });

        }

        const { id, action } = req.body;

        const parsedId = Number(id);

        if (
            !Number.isSafeInteger(parsedId) ||
            parsedId <= 0
        ) {

            return send(res, 400, {
                success: false,
                error: "Invalid request ID."
            });

        }

        const validActions = [
            "approve",
            "reject",
            "in_progress",
            "complete",
            "cancel"
        ];

        if (!validActions.includes(action)) {

            return send(res, 400, {
                success: false,
                error: "Invalid action."
            });

        }


        /* ======================================
           SUPABASE CONFIGURATION
        ====================================== */

        const supabaseUrl =
            getSupabaseUrl(
                process.env.SUPABASE_URL
            );

        const supabaseSecret =
            process.env.SUPABASE_SECRET_KEY;

        if (
            !supabaseUrl ||
            typeof supabaseSecret !== "string" ||
            !supabaseSecret.trim()
        ) {

            console.error(
                "Invalid Supabase configuration."
            );

            return send(res, 500, {
                success: false,
                error: "Server configuration error."
            });

        }


        /* ======================================
           SUPABASE HEADERS
        ====================================== */

        const headers = {

            "Content-Type": "application/json",

            "apikey": supabaseSecret,

            "Authorization":
                `Bearer ${supabaseSecret}`,

            "Accept": "application/json"

        };


        /* ======================================
           LOAD REQUEST
        ====================================== */

        const requestQuery = new URLSearchParams({

            id: `eq.${parsedId}`,

            select: [
                "id",
                "service",
                "pi_username",
                "review_status",
                "order_status"
            ].join(","),

            limit: "1"

        });

        const requestResult = await fetchJson(
            `${supabaseUrl}/rest/v1/requests?${requestQuery}`,
            {
                method: "GET",
                headers
            }
        );

        if (!requestResult.response.ok) {

            console.error(
                "Admin request lookup failed:",
                requestResult.response.status
            );

            return send(res, 502, {
                success: false,
                error: "Failed to load request."
            });

        }

        const requestData = requestResult.data;

        if (
            !Array.isArray(requestData) ||
            requestData.length === 0
        ) {

            return send(res, 404, {
                success: false,
                error: "Request not found."
            });

        }

        const request = requestData[0];

        const currentReviewStatus =
            request.review_status ||
            "Waiting for review";

        const currentOrderStatus =
            request.order_status ||
            "Pending";


        /* ======================================
           CONDITIONAL UPDATE
        ====================================== */

        async function conditionalUpdate(
            filters,
            changes
        ) {

            const query = new URLSearchParams({

                id: `eq.${parsedId}`,

                ...filters

            });

            const result = await fetchJson(
                `${supabaseUrl}/rest/v1/requests?${query}`,
                {
                    method: "PATCH",

                    headers: {
                        ...headers,
                        "Prefer": "return=representation"
                    },

                    body: JSON.stringify(changes)
                }
            );

            if (!result.response.ok) {

                console.error(
                    "Conditional update failed:",
                    result.response.status
                );

                return {
                    error: true,
                    data: null
                };

            }

            if (!Array.isArray(result.data)) {

                return {
                    error: true,
                    data: null
                };

            }

            return {
                error: false,
                data: result.data
            };

        }


        /* ======================================
           CREATE NOTIFICATION
           Notification failure must not undo
           a successful request status update.
        ====================================== */

        async function createNotification(
            type,
            title,
            message
        ) {

            const piUsername = String(
                request.pi_username || ""
            ).trim();

            if (!piUsername) {

                console.warn(
                    `Notification skipped for request #${parsedId}.`
                );

                return false;

            }

            try {

                const query = new URLSearchParams({

                    request_id: `eq.${parsedId}`,

                    type: `eq.${type}`,

                    select: "id",

                    limit: "1"

                });

                const existing = await fetchJson(
                    `${supabaseUrl}/rest/v1/notifications?${query}`,
                    {
                        method: "GET",
                        headers
                    }
                );

                if (!existing.response.ok) {

                    console.error(
                        "Notification lookup failed:",
                        existing.response.status
                    );

                    return false;

                }

                if (
                    Array.isArray(existing.data) &&
                    existing.data.length > 0
                ) {

                    return true;

                }

                const inserted = await fetchJson(
                    `${supabaseUrl}/rest/v1/notifications`,
                    {
                        method: "POST",

                        headers: {
                            ...headers,
                            "Prefer": "return=minimal"
                        },

                        body: JSON.stringify({

                            request_id: parsedId,

                            pi_username: piUsername,

                            type,

                            title,

                            message,

                            is_read: false

                        })
                    }
                );

                if (!inserted.response.ok) {

                    console.error(
                        "Notification insert failed:",
                        inserted.response.status
                    );

                    return false;

                }

                return true;

            } catch (error) {

                console.error(
                    "Notification operation failed:",
                    error.name === "AbortError"
                        ? "Timeout"
                        : error.message
                );

                return false;

            }

        }


        /* ======================================
           APPROVE
           Waiting for review + Pending only
        ====================================== */

        if (action === "approve") {

            if (
                currentReviewStatus !==
                    "Waiting for review" ||
                currentOrderStatus !== "Pending"
            ) {

                return send(res, 409, {
                    success: false,
                    error: "Only Pending requests awaiting review can be approved."
                });

            }

            const result = await conditionalUpdate(
                {
                    review_status:
                        "eq.Waiting for review",

                    order_status:
                        "eq.Pending"
                },
                {
                    review_status: "Approved"
                }
            );

            if (result.error) {

                return send(res, 502, {
                    success: false,
                    error: "Failed to approve request."
                });

            }

            if (!result.data.length) {

                return send(res, 409, {
                    success: false,
                    error: "Request status changed. Reload and try again."
                });

            }

            await createNotification(
                "approved",
                "Request Approved",
                `Your request #${parsedId} has been approved.`
            );

            return send(res, 200, {

                success: true,

                message: "Request approved successfully.",

                request: result.data[0]

            });

        }


        /* ======================================
           REJECT
           Waiting for review + Pending only
        ====================================== */

        if (action === "reject") {

            if (
                currentReviewStatus !==
                    "Waiting for review" ||
                currentOrderStatus !== "Pending"
            ) {

                return send(res, 409, {
                    success: false,
                    error: "Only Pending requests awaiting review can be rejected."
                });

            }

            const result = await conditionalUpdate(
                {
                    review_status:
                        "eq.Waiting for review",

                    order_status:
                        "eq.Pending"
                },
                {
                    review_status: "Rejected"
                }
            );

            if (result.error) {

                return send(res, 502, {
                    success: false,
                    error: "Failed to reject request."
                });

            }

            if (!result.data.length) {

                return send(res, 409, {
                    success: false,
                    error: "Request status changed. Reload and try again."
                });

            }

            await createNotification(
                "rejected",
                "Request Rejected",
                `Your request #${parsedId} has been rejected.`
            );

            return send(res, 200, {

                success: true,

                message: "Request rejected successfully.",

                request: result.data[0]

            });

        }


        /* ======================================
           ORDER TRANSITION RULES
        ====================================== */

        let expectedStatus;
        let newStatus;
        let notificationType;
        let notificationTitle;
        let notificationMessage;


        if (action === "in_progress") {

            expectedStatus = "Paid";

            newStatus = "In Progress";

            notificationType = "in_progress";

            notificationTitle = "Order In Progress";

            notificationMessage =
                `Your order for request #${parsedId} is now in progress.`;

        } else if (action === "complete") {

            expectedStatus = "In Progress";

            newStatus = "Completed";

            notificationType = "completed";

            notificationTitle = "Order Completed";

            notificationMessage =
                `Your order for request #${parsedId} has been completed.`;

        } else if (action === "cancel") {

            expectedStatus = "Pending";

            newStatus = "Cancelled";

            notificationType = "cancelled";

            notificationTitle = "Order Cancelled";

            notificationMessage =
                `Your order for request #${parsedId} has been cancelled.`;

        }


        /* ======================================
           VERIFY CURRENT STATE
        ====================================== */

        if (currentOrderStatus !== expectedStatus) {

            let errorMessage;

            if (action === "in_progress") {

                errorMessage =
                    "Request must be Paid before it can be marked In Progress.";

            } else if (action === "complete") {

                errorMessage =
                    "Request must be In Progress before it can be Completed.";

            } else {

                errorMessage =
                    "Only Pending orders can be cancelled.";

            }

            return send(res, 409, {
                success: false,
                error: errorMessage
            });

        }


        /* ======================================
           REVIEW STATUS REQUIREMENT
        ====================================== */

        if (
            (
                action === "in_progress" ||
                action === "complete"
            ) &&
            currentReviewStatus !== "Approved"
        ) {

            return send(res, 409, {
                success: false,
                error: "Request must be approved before order processing."
            });

        }


        /* ======================================
           CONDITIONAL ORDER UPDATE
        ====================================== */

        const filters = {

            order_status: `eq.${expectedStatus}`

        };

        if (
            action === "in_progress" ||
            action === "complete"
        ) {

            filters.review_status = "eq.Approved";

        }

        const result = await conditionalUpdate(
            filters,
            {
                order_status: newStatus
            }
        );

        if (result.error) {

            return send(res, 502, {
                success: false,
                error: "Failed to update order status."
            });

        }

        if (!result.data.length) {

            return send(res, 409, {
                success: false,
                error: "Order status changed. Reload and try again."
            });

        }


        /* ======================================
           NOTIFICATION
        ====================================== */

        await createNotification(
            notificationType,
            notificationTitle,
            notificationMessage
        );


        /* ======================================
           SUCCESS
        ====================================== */

        return send(res, 200, {

            success: true,

            message: `Request marked as ${newStatus}.`,

            request: result.data[0]

        });


    } catch (error) {

        if (error.name === "AbortError") {

            return send(res, 504, {
                success: false,
                error: "Database request timed out. Please try again."
            });

        }

        if (
            error.message ===
            "INVALID_SUPABASE_RESPONSE"
        ) {

            return send(res, 502, {
                success: false,
                error: "Invalid database response."
            });

        }

        console.error(
            "Admin review API error:",
            error.message
        );

        return send(res, 500, {
            success: false,
            error: "Internal server error."
        });

    }

}
