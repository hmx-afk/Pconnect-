// ==========================================
// PConnect - Admin Review & Order Status API
// Conditional Update Security Version
// ==========================================

import crypto from "crypto";

export default async function handler(req, res) {
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        // ==========================================
        // ADMIN AUTHENTICATION
        // ==========================================

        const adminKey = String(
            req.headers["x-admin-key"] || ""
        );

        const correctAdminKey = String(
            process.env.ADMIN_REVIEW_KEY || ""
        );

        if (!correctAdminKey) {
            console.error("Missing ADMIN_REVIEW_KEY");

            return res.status(500).json({
                success: false,
                error: "Admin authentication is not configured"
            });
        }

        const providedBuffer = Buffer.from(adminKey, "utf8");
        const correctBuffer = Buffer.from(correctAdminKey, "utf8");

        const authenticated =
            providedBuffer.length === correctBuffer.length &&
            crypto.timingSafeEqual(providedBuffer, correctBuffer);

        if (!authenticated) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        // ==========================================
        // VALIDATE INPUT
        // ==========================================

        const { id, action } = req.body || {};
        const parsedId = Number(id);

        if (
            !Number.isSafeInteger(parsedId) ||
            parsedId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid request id"
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
            return res.status(400).json({
                success: false,
                error: "Invalid action"
            });
        }

        // ==========================================
        // SUPABASE CONFIGURATION
        // ==========================================

        const supabaseUrl = String(
            process.env.SUPABASE_URL || ""
        ).replace(/\/+$/, "");

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseSecretKey) {
            console.error("Missing Supabase configuration");

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });
        }

        const headers = {
            "Content-Type": "application/json",
            "apikey": supabaseSecretKey,
            "Authorization": `Bearer ${supabaseSecretKey}`
        };

        // ==========================================
        // FETCH WITH TIMEOUT
        // ==========================================

        async function fetchWithTimeout(url, options = {}) {
            const controller = new AbortController();

            const timeout = setTimeout(
                () => controller.abort(),
                10000
            );

            try {
                return await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }
        }

        // ==========================================
        // LOAD REQUEST
        // ==========================================

        const requestResponse = await fetchWithTimeout(
            `${supabaseUrl}/rest/v1/requests?id=eq.${parsedId}&select=*`,
            {
                method: "GET",
                headers
            }
        );

        if (!requestResponse.ok) {
            console.error(
                "Request fetch failed:",
                requestResponse.status
            );

            return res.status(500).json({
                success: false,
                error: "Failed to load request"
            });
        }

        const requestData = await requestResponse.json();

        if (
            !Array.isArray(requestData) ||
            requestData.length === 0
        ) {
            return res.status(404).json({
                success: false,
                error: "Request not found"
            });
        }

        const request = requestData[0];

        const currentReviewStatus =
            request.review_status || "Waiting for review";

        const currentOrderStatus =
            request.order_status || "Pending";

        // ==========================================
        // CONDITIONAL UPDATE HELPER
        // ==========================================

        async function conditionalUpdate(
            filters,
            changes
        ) {
            const query = new URLSearchParams({
                id: `eq.${parsedId}`,
                ...filters
            });

            const response = await fetchWithTimeout(
                `${supabaseUrl}/rest/v1/requests?${query.toString()}`,
                {
                    method: "PATCH",
                    headers: {
                        ...headers,
                        "Prefer": "return=representation"
                    },
                    body: JSON.stringify(changes)
                }
            );

            if (!response.ok) {
                console.error(
                    "Conditional update failed:",
                    response.status
                );

                return {
                    error: true,
                    data: null
                };
            }

            const data = await response.json();

            return {
                error: false,
                data
            };
        }

        // ==========================================
        // NOTIFICATIONS
        // ==========================================

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
                    `Notification skipped for request #${parsedId}`
                );

                return null;
            }

            try {
                const query = new URLSearchParams({
                    request_id: `eq.${parsedId}`,
                    type: `eq.${type}`,
                    select: "id",
                    limit: "1"
                });

                const existingResponse = await fetchWithTimeout(
                    `${supabaseUrl}/rest/v1/notifications?${query}`,
                    {
                        method: "GET",
                        headers
                    }
                );

                if (existingResponse.ok) {
                    const existingData =
                        await existingResponse.json();

                    if (
                        Array.isArray(existingData) &&
                        existingData.length > 0
                    ) {
                        return existingData[0];
                    }
                }

                const notificationResponse =
                    await fetchWithTimeout(
                        `${supabaseUrl}/rest/v1/notifications`,
                        {
                            method: "POST",
                            headers: {
                                ...headers,
                                "Prefer": "return=representation"
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

                if (!notificationResponse.ok) {
                    console.error(
                        "Notification creation failed:",
                        notificationResponse.status
                    );

                    return null;
                }

                const notificationData =
                    await notificationResponse.json();

                return notificationData?.[0] || null;

            } catch (error) {
                console.error(
                    "Notification operation failed:",
                    error?.name === "AbortError"
                        ? "Timeout"
                        : "Unexpected error"
                );

                return null;
            }
        }

        // ==========================================
        // APPROVE
        // ==========================================

        if (action === "approve") {
            if (currentReviewStatus === "Rejected") {
                return res.status(400).json({
                    success: false,
                    error: "Rejected requests cannot be approved directly"
                });
            }

            if (currentReviewStatus === "Approved") {
                return res.status(409).json({
                    success: false,
                    error: "Request is already approved"
                });
            }

            if (currentReviewStatus !== "Waiting for review") {
                return res.status(409).json({
                    success: false,
                    error: "Request review status is invalid"
                });
            }

            const result = await conditionalUpdate(
                {
                    review_status: "eq.Waiting for review"
                },
                {
                    review_status: "Approved"
                }
            );

            if (result.error) {
                return res.status(500).json({
                    success: false,
                    error: "Failed to approve request"
                });
            }

            if (!result.data?.length) {
                return res.status(409).json({
                    success: false,
                    error: "Request changed. Reload and try again."
                });
            }

            await createNotification(
                "approved",
                "Request Approved",
                `Your request #${parsedId} has been approved.`
            );

            return res.status(200).json({
                success: true,
                message: "Request approved successfully",
                request: result.data[0]
            });
        }

        // ==========================================
        // REJECT
        // ==========================================

        if (action === "reject") {
            if (currentReviewStatus === "Approved") {
                return res.status(400).json({
                    success: false,
                    error: "Approved requests cannot be rejected directly"
                });
            }

            if (currentReviewStatus === "Rejected") {
                return res.status(409).json({
                    success: false,
                    error: "Request is already rejected"
                });
            }

            if (currentReviewStatus !== "Waiting for review") {
                return res.status(409).json({
                    success: false,
                    error: "Request review status is invalid"
                });
            }

            const result = await conditionalUpdate(
                {
                    review_status: "eq.Waiting for review"
                },
                {
                    review_status: "Rejected"
                }
            );

            if (result.error) {
                return res.status(500).json({
                    success: false,
                    error: "Failed to reject request"
                });
            }

            if (!result.data?.length) {
                return res.status(409).json({
                    success: false,
                    error: "Request changed. Reload and try again."
                });
            }

            await createNotification(
                "rejected",
                "Request Rejected",
                `Your request #${parsedId} has been rejected.`
            );

            return res.status(200).json({
                success: true,
                message: "Request rejected successfully",
                request: result.data[0]
            });
        }

        // ==========================================
        // ORDER TRANSITIONS
        // ==========================================

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
        } else {
            expectedStatus = "Pending";
            newStatus = "Cancelled";
            notificationType = "cancelled";
            notificationTitle = "Order Cancelled";
            notificationMessage =
                `Your order for request #${parsedId} has been cancelled.`;
        }

        // ==========================================
        // CHECK CURRENT STATE
        // ==========================================

        if (currentOrderStatus !== expectedStatus) {
            let errorMessage;

            if (action === "cancel") {
                errorMessage =
                    "Only Pending orders can be cancelled.";
            } else if (action === "in_progress") {
                errorMessage =
                    "Request must be Paid before it can be marked In Progress.";
            } else {
                errorMessage =
                    "Request must be In Progress before it can be Completed.";
            }

            return res.status(400).json({
                success: false,
                error: errorMessage
            });
        }

        if (
            (action === "in_progress" || action === "complete") &&
            currentReviewStatus !== "Approved"
        ) {
            return res.status(400).json({
                success: false,
                error: "Request must be approved before order processing."
            });
        }

        // ==========================================
        // ATOMIC CONDITIONAL ORDER UPDATE
        // ==========================================

        const result = await conditionalUpdate(
            {
                order_status: `eq.${expectedStatus}`,
                ...(action === "in_progress" ||
                action === "complete"
                    ? { review_status: "eq.Approved" }
                    : {})
            },
            {
                order_status: newStatus
            }
        );

        if (result.error) {
            return res.status(500).json({
                success: false,
                error: "Failed to update order status"
            });
        }

        if (!result.data?.length) {
            return res.status(409).json({
                success: false,
                error: "Order status changed or request was not updated. Reload and try again."
            });
        }

        // ==========================================
        // CREATE NOTIFICATION
        // ==========================================

        await createNotification(
            notificationType,
            notificationTitle,
            notificationMessage
        );

        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({
            success: true,
            message: `Request marked as ${newStatus}`,
            request: result.data[0]
        });

    } catch (error) {
        console.error(
            "Admin review API error:",
            error?.name === "AbortError"
                ? "Supabase request timed out"
                : "Unexpected error"
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
