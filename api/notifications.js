// ==========================================
// PConnect - Notifications API
// Security Hardened Version
// Pi Testnet / Vercel / Supabase
// ==========================================

import crypto from "crypto";

const PI_ME_URL = "https://api.minepi.com/v2/me";
const REQUEST_TIMEOUT = 10000;
const MAX_USERNAME_LENGTH = 100;
const MAX_TYPE_LENGTH = 50;
const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;

// ==========================================
// RESPONSE HELPERS
// ==========================================

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        error: message
    });
}

function getBearerToken(req) {
    const header = String(
        req.headers.authorization || ""
    );

    const match = header.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
        return null;
    }

    const token = match[1].trim();

    if (
        !token ||
        token.length > 10000
    ) {
        return null;
    }

    return token;
}

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

function isAdmin(req) {
    const suppliedKey = String(
        req.headers["x-admin-key"] || ""
    );

    const expectedKey = String(
        process.env.ADMIN_REVIEW_KEY || ""
    );

    if (!suppliedKey || !expectedKey) {
        return false;
    }

    const supplied = Buffer.from(
        suppliedKey,
        "utf8"
    );

    const expected = Buffer.from(
        expectedKey,
        "utf8"
    );

    return (
        supplied.length === expected.length &&
        crypto.timingSafeEqual(
            supplied,
            expected
        )
    );
}

// ==========================================
// VERIFY PI ACCESS TOKEN
// ==========================================

async function verifyPiUser(req) {
    const token = getBearerToken(req);

    if (!token) {
        return {
            ok: false,
            status: 401,
            error: "Pi authentication required"
        };
    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        const response = await fetch(
            PI_ME_URL,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            return {
                ok: false,
                status: 401,
                error: "Pi authentication failed"
            };
        }

        const identity = await response.json();

        const username = String(
            identity?.username || ""
        ).trim();

        const uid = String(
            identity?.uid || ""
        ).trim();

        if (
            !username ||
            username.length > MAX_USERNAME_LENGTH ||
            !uid
        ) {
            return {
                ok: false,
                status: 401,
                error: "Invalid Pi identity"
            };
        }

        return {
            ok: true,
            username,
            uid
        };

    } catch (error) {
        if (error?.name === "AbortError") {
            return {
                ok: false,
                status: 504,
                error: "Pi authentication timed out"
            };
        }

        console.error(
            "Pi identity verification failed:",
            error?.message || "Unknown error"
        );

        return {
            ok: false,
            status: 502,
            error: "Unable to verify Pi identity"
        };

    } finally {
        clearTimeout(timeout);
    }
}

// ==========================================
// SUPABASE REQUEST HELPER
// ==========================================

async function supabaseFetch(
    url,
    options = {}
) {
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        return await fetch(
            url,
            {
                ...options,
                signal: controller.signal
            }
        );

    } finally {
        clearTimeout(timeout);
    }
}

function getSupabaseConfig() {
    const url = String(
        process.env.SUPABASE_URL || ""
    ).replace(/\/+$/, "");

    const key = String(
        process.env.SUPABASE_SECRET_KEY || ""
    );

    if (
        !url ||
        !key ||
        !/^https:\/\/[^/]+$/i.test(url)
    ) {
        return null;
    }

    return {
        url,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
        }
    };
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Authorization");

    if (
        !["GET", "POST", "PATCH"].includes(
            req.method
        )
    ) {
        res.setHeader(
            "Allow",
            "GET, POST, PATCH"
        );

        return sendError(
            res,
            405,
            "Method not allowed"
        );
    }

    try {
        const config = getSupabaseConfig();

        if (!config) {
            console.error(
                "Supabase server configuration is missing or invalid"
            );

            return sendError(
                res,
                500,
                "Server configuration error"
            );
        }

        const endpoint =
            `${config.url}/rest/v1/notifications`;

        const requestsEndpoint =
            `${config.url}/rest/v1/requests`;

        const headers = config.headers;

        // ======================================
        // GET - USER'S OWN NOTIFICATIONS
        // ======================================

        if (req.method === "GET") {
            const identity = await verifyPiUser(req);

            if (!identity.ok) {
                return sendError(
                    res,
                    identity.status,
                    identity.error
                );
            }

            const url = new URL(endpoint);

            url.searchParams.set(
                "select",
                "id,request_id,type,title,message,is_read,created_at"
            );

            url.searchParams.set(
                "pi_username",
                `eq.${identity.username}`
            );

            url.searchParams.set(
                "order",
                "created_at.desc"
            );

            url.searchParams.set(
                "limit",
                "50"
            );

            const response = await supabaseFetch(
                url.toString(),
                { headers }
            );

            if (!response.ok) {
                console.error(
                    "Notifications GET failed with status:",
                    response.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to load notifications"
                );
            }

            const data = await response.json();

            return res.status(200).json({
                success: true,
                notifications: Array.isArray(data)
                    ? data
                    : []
            });
        }

        // ======================================
        // POST - ADMIN ONLY
        // ======================================

        if (req.method === "POST") {
            if (!isAdmin(req)) {
                return sendError(
                    res,
                    401,
                    "Unauthorized"
                );
            }

            const body =
                req.body &&
                typeof req.body === "object" &&
                !Array.isArray(req.body)
                    ? req.body
                    : {};

            const requestId = Number(
                body.request_id
            );

            const type = String(
                body.type || ""
            ).trim();

            const title = String(
                body.title || ""
            ).trim();

            const message = String(
                body.message || ""
            ).trim();

            if (
                !Number.isSafeInteger(requestId) ||
                requestId <= 0
            ) {
                return sendError(
                    res,
                    400,
                    "Valid request_id is required"
                );
            }

            if (
                !type ||
                type.length > MAX_TYPE_LENGTH ||
                !title ||
                title.length > MAX_TITLE_LENGTH ||
                !message ||
                message.length > MAX_MESSAGE_LENGTH
            ) {
                return sendError(
                    res,
                    400,
                    "Invalid notification type, title or message"
                );
            }

            // Confirm the request exists and obtain
            // its owner from the database.
            const requestUrl = new URL(
                requestsEndpoint
            );

            requestUrl.searchParams.set(
                "id",
                `eq.${requestId}`
            );

            requestUrl.searchParams.set(
                "select",
                "id,pi_username"
            );

            requestUrl.searchParams.set(
                "limit",
                "1"
            );

            const requestResponse =
                await supabaseFetch(
                    requestUrl.toString(),
                    { headers }
                );

            if (!requestResponse.ok) {
                console.error(
                    "Request owner lookup failed with status:",
                    requestResponse.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to verify request"
                );
            }

            const requests =
                await requestResponse.json();

            if (
                !Array.isArray(requests) ||
                requests.length === 0
            ) {
                return sendError(
                    res,
                    404,
                    "Request not found"
                );
            }

            const requestOwner = String(
                requests[0].pi_username || ""
            ).trim();

            if (
                !requestOwner ||
                requestOwner.length > MAX_USERNAME_LENGTH
            ) {
                return sendError(
                    res,
                    400,
                    "Request has no valid Pi username"
                );
            }

            // Use the database owner, never a
            // client-supplied username.
            const duplicateUrl = new URL(endpoint);

            duplicateUrl.searchParams.set(
                "select",
                "id"
            );

            duplicateUrl.searchParams.set(
                "request_id",
                `eq.${requestId}`
            );

            duplicateUrl.searchParams.set(
                "type",
                `eq.${type}`
            );

            duplicateUrl.searchParams.set(
                "limit",
                "1"
            );

            const duplicateResponse =
                await supabaseFetch(
                    duplicateUrl.toString(),
                    { headers }
                );

            if (!duplicateResponse.ok) {
                console.error(
                    "Notification duplicate check failed with status:",
                    duplicateResponse.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to check notification"
                );
            }

            const duplicates =
                await duplicateResponse.json();

            if (
                Array.isArray(duplicates) &&
                duplicates.length > 0
            ) {
                return res.status(200).json({
                    success: true,
                    duplicate: true
                });
            }

            const insertResponse =
                await supabaseFetch(
                    endpoint,
                    {
                        method: "POST",
                        headers: {
                            ...headers,
                            Prefer: "return=representation"
                        },
                        body: JSON.stringify({
                            request_id: requestId,
                            pi_username: requestOwner,
                            type,
                            title,
                            message,
                            is_read: false
                        })
                    }
                );

            const insertData =
                await insertResponse.json().catch(
                    () => null
                );

            if (!insertResponse.ok) {
                console.error(
                    "Notification insert failed with status:",
                    insertResponse.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to create notification"
                );
            }

            return res.status(201).json({
                success: true,
                notification: Array.isArray(insertData)
                    ? insertData[0] || null
                    : insertData
            });
        }

        // ======================================
        // PATCH - MARK OWN NOTIFICATION AS READ
        // ======================================

        if (req.method === "PATCH") {
            const identity = await verifyPiUser(req);

            if (!identity.ok) {
                return sendError(
                    res,
                    identity.status,
                    identity.error
                );
            }

            const body =
                req.body &&
                typeof req.body === "object" &&
                !Array.isArray(req.body)
                    ? req.body
                    : {};

            const id = Number(body.id);

            if (
                !Number.isSafeInteger(id) ||
                id <= 0
            ) {
                return sendError(
                    res,
                    400,
                    "Valid notification id is required"
                );
            }

            const updateUrl = new URL(endpoint);

            updateUrl.searchParams.set(
                "id",
                `eq.${id}`
            );

            // This username comes from the verified
            // Pi identity, not from the request body.
            updateUrl.searchParams.set(
                "pi_username",
                `eq.${identity.username}`
            );

            updateUrl.searchParams.set(
                "select",
                "id,request_id,type,title,message,is_read,created_at"
            );

            const response = await supabaseFetch(
                updateUrl.toString(),
                {
                    method: "PATCH",
                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify({
                        is_read: true
                    })
                }
            );

            if (!response.ok) {
                console.error(
                    "Notification PATCH failed with status:",
                    response.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to mark notification as read"
                );
            }

            const data = await response.json();

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                return sendError(
                    res,
                    404,
                    "Notification not found"
                );
            }

            return res.status(200).json({
                success: true,
                notification: data[0]
            });
        }

    } catch (error) {
        if (error?.name === "AbortError") {
            return sendError(
                res,
                504,
                "Request timed out"
            );
        }

        console.error(
            "Notifications API error:",
            error?.message || "Unknown error"
        );

        return sendError(
            res,
            500,
            "Internal server error"
        );
    }
}
