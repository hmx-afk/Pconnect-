// ==========================================
// PConnect - Secure Admin Requests API
// Admin Authentication
// Supabase REST API
// Testnet
// ==========================================

import crypto from "crypto";

const REQUEST_TIMEOUT = 10000;
const MAX_REQUESTS = 100;


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

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

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
        typeof expectedKey !== "string"
    ) {
        return false;
    }

    if (
        !providedKey ||
        !expectedKey ||
        providedKey.length > 4096 ||
        expectedKey.length > 4096
    ) {
        return false;
    }

    const providedBuffer =
        Buffer.from(providedKey, "utf8");

    const expectedBuffer =
        Buffer.from(expectedKey, "utf8");

    if (
        providedBuffer.length !==
        expectedBuffer.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        providedBuffer,
        expectedBuffer
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
   MAIN HANDLER
========================================== */

export default async function handler(req, res) {

    setSecurityHeaders(res);

    /* METHOD CHECK */

    if (req.method !== "GET") {

        res.setHeader("Allow", "GET");

        return send(res, 405, {
            success: false,
            error: "Method not allowed."
        });

    }


    /* ENVIRONMENT VARIABLES */

    const adminSecret =
        process.env.ADMIN_REVIEW_KEY;

    const supabaseUrl =
        getSupabaseUrl(
            process.env.SUPABASE_URL
        );

    const supabaseSecret =
        process.env.SUPABASE_SECRET_KEY;


    if (
        !adminSecret ||
        typeof adminSecret !== "string"
    ) {

        console.error(
            "Admin authentication configuration missing."
        );

        return send(res, 500, {
            success: false,
            error: "Server configuration error."
        });

    }


    /* ADMIN AUTHENTICATION */

    const providedKey =
        req.headers["x-admin-key"];

    if (
        !verifyAdminKey(
            providedKey,
            adminSecret
        )
    ) {

        return send(res, 401, {
            success: false,
            error: "Unauthorized admin access."
        });

    }


    /* SUPABASE CONFIGURATION */

    if (
        !supabaseUrl ||
        typeof supabaseSecret !== "string" ||
        !supabaseSecret.trim()
    ) {

        console.error(
            "Supabase configuration missing or invalid."
        );

        return send(res, 500, {
            success: false,
            error: "Server configuration error."
        });

    }


    /* ======================================
       FETCH REQUESTS
    ====================================== */

    const controller =
        new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {

        const query = new URLSearchParams({

            select: [
                "id",
                "service",
                "name",
                "contact",
                "details",
                "payment",
                "status",
                "review_status",
                "order_status",
                "pi_username",
                "created_at"
            ].join(","),

            order: "created_at.desc",

            limit: String(MAX_REQUESTS)

        });


        const endpoint =
            `${supabaseUrl}/rest/v1/requests?${query.toString()}`;


        const response = await fetch(
            endpoint,
            {
                method: "GET",

                headers: {

                    "apikey": supabaseSecret,

                    "Authorization":
                        `Bearer ${supabaseSecret}`,

                    "Accept": "application/json"

                },

                signal: controller.signal

            }
        );


        /* READ RESPONSE */

        const responseText =
            await response.text();


        if (!response.ok) {

            console.error(
                "Admin requests database error:",
                response.status
            );

            return send(res, 502, {
                success: false,
                error: "Unable to load requests."
            });

        }


        /* PARSE JSON */

        let requests;

        try {

            requests = JSON.parse(responseText);

        } catch {

            console.error(
                "Invalid Supabase response."
            );

            return send(res, 502, {
                success: false,
                error: "Invalid database response."
            });

        }


        /* VALIDATE DATA */

        if (!Array.isArray(requests)) {

            return send(res, 502, {
                success: false,
                error: "Invalid requests data."
            });

        }


        /* SUCCESS */

        return send(res, 200, {

            success: true,

            count: requests.length,

            requests: requests

        });


    } catch (error) {

        if (error.name === "AbortError") {

            return send(res, 504, {
                success: false,
                error: "Request timed out. Please try again."
            });

        }

        console.error(
            "Admin requests API error:",
            error.message
        );

        return send(res, 500, {
            success: false,
            error: "Internal server error."
        });

    } finally {

        clearTimeout(timer);

    }

}
