// ==========================================
// PConnect - Secure Notifications API
// Pi Testnet / Vercel / Supabase
// ==========================================

import crypto from "crypto";
import { verifyPi } from "../lib/verifyPi.js";

const REQUEST_TIMEOUT = 10000;

const MAX_ADMIN_KEY_LENGTH = 4096;
const MAX_USERNAME_LENGTH = 50;

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

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

function isAdmin(req) {

    const suppliedKey =
        typeof req.headers["x-admin-key"] === "string"
            ? req.headers["x-admin-key"]
            : "";

    const expectedKey =
        process.env.ADMIN_REVIEW_KEY || "";

    if (
        !suppliedKey ||
        !expectedKey ||
        suppliedKey.length > MAX_ADMIN_KEY_LENGTH ||
        expectedKey.length > MAX_ADMIN_KEY_LENGTH
    ) {
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
// SUPABASE CONFIGURATION
// ==========================================

function getSupabaseConfig() {

    const url = String(
        process.env.SUPABASE_URL || ""
    ).replace(/\/+$/, "");

    const key = String(
        process.env.SUPABASE_SECRET_KEY || ""
    );

    if (!url || !key) {
        return null;
    }

    try {

        const parsed = new URL(url);

        if (
            parsed.protocol !== "https:" ||
            !/^[a-z0-9-]+\.supabase\.co$/i.test(
                parsed.hostname
            ) ||
            parsed.port ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== "/" ||
            parsed.search ||
            parsed.hash
        ) {
            return null;
        }

    } catch {
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
// SUPABASE REQUEST WITH FULL TIMEOUT
// Includes response body reading
// ==========================================

async function supabaseRequest(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(
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
                    "Invalid Supabase response"
                );
            }
        }

        return {
            ok: response.ok,
            status: response.status,
            data
        };

    } finally {

        clearTimeout(timeout);

    }
}

// ==========================================
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {

    // ==========================================
    // SECURITY HEADERS
    // ==========================================

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Authorization");

    // ==========================================
    // ALLOWED METHODS
    // ==========================================

    if (
        !["GET", "POST", "PATCH"].includes(req.method)
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

        // ==========================================
        // SUPABASE CONFIGURATION
        // ==========================================

        const config = getSupabaseConfig();

        if (!config) {

            console.error(
                "Invalid Supabase configuration"
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

        // ==========================================
        // GET - USER NOTIFICATIONS
        // ==========================================

        if (req.method === "GET") {

            const identity = await verifyPi(req);

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

            const result = await supabaseRequest(
                url.toString(),
                { headers }
            );

            if (!result.ok) {

                console.error(
                    "Notifications GET failed:",
                    result.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to load notifications"
                );
            }

            return res.status(200).json({
                success: true,
                notifications: Array.isArray(result.data)
                    ? result.data
                    : []
            });
        }

        // ==========================================
        // POST - ADMIN ONLY
        // ==========================================

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

            const type =
                typeof body.type === "string"
                    ? body.type.trim()
                    : "";

            const title =
                typeof body.title === "string"
                    ? body.title.trim()
                    : "";

            const message =
                typeof body.message === "string"
                    ? body.message.trim()
                    : "";

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

            // ======================================
            // VERIFY REQUEST OWNER
            // ======================================

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

            const requestResult =
                await supabaseRequest(
                    requestUrl.toString(),
                    { headers }
                );

            if (!requestResult.ok) {

                console.error(
                    "Request owner lookup failed:",
                    requestResult.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to verify request"
                );
            }

            const requests = requestResult.data;

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

            const requestOwner =
                typeof requests[0].pi_username === "string"
                    ? requests[0].pi_username.trim()
                    : "";

            if (
                !requestOwner ||
                requestOwner.length > MAX_USERNAME_LENGTH ||
                !/^[a-zA-Z0-9._-]+$/.test(requestOwner)
            ) {
                return sendError(
                    res,
                    400,
                    "Request has no valid Pi username"
                );
            }

            // ======================================
            // DUPLICATE NOTIFICATION CHECK
            // ======================================

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

            const duplicateResult =
                await supabaseRequest(
                    duplicateUrl.toString(),
                    { headers }
                );

            if (!duplicateResult.ok) {

                console.error(
                    "Notification duplicate check failed:",
                    duplicateResult.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to check notification"
                );
            }

            const duplicates = duplicateResult.data;

            if (
                Array.isArray(duplicates) &&
                duplicates.length > 0
            ) {
                return res.status(200).json({
                    success: true,
                    duplicate: true
                });
            }

            // ======================================
            // INSERT NOTIFICATION
            // ======================================

            const insertResult =
                await supabaseRequest(
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

            if (!insertResult.ok) {

                const insertError = insertResult.data;

                // Handle concurrent duplicate notification.
                if (
                    insertResult.status === 409 &&
                    insertError &&
                    typeof insertError === "object" &&
                    insertError.code === "23505"
                ) {
                    return res.status(200).json({
                        success: true,
                        duplicate: true
                    });
                }

                console.error(
                    "Notification insert failed:",
                    insertResult.status,
                    insertError?.code || "UNKNOWN"
                );

                return sendError(
                    res,
                    500,
                    "Failed to create notification"
                );
            }

            const inserted = insertResult.data;

            return res.status(201).json({
                success: true,
                notification: Array.isArray(inserted)
                    ? inserted[0] || null
                    : inserted
            });
        }

        // ==========================================
        // PATCH - MARK OWN NOTIFICATION AS READ
        // ==========================================

        if (req.method === "PATCH") {

            const identity = await verifyPi(req);

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

            updateUrl.searchParams.set(
                "pi_username",
                `eq.${identity.username}`
            );

            updateUrl.searchParams.set(
                "select",
                "id,request_id,type,title,message,is_read,created_at"
            );

            const updateResult =
                await supabaseRequest(
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

            if (!updateResult.ok) {

                console.error(
                    "Notification PATCH failed:",
                    updateResult.status
                );

                return sendError(
                    res,
                    500,
                    "Failed to mark notification as read"
                );
            }

            const updated = updateResult.data;

            if (
                !Array.isArray(updated) ||
                updated.length === 0
            ) {
                return sendError(
                    res,
                    404,
                    "Notification not found"
                );
            }

            return res.status(200).json({
                success: true,
                notification: updated[0]
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
