// ==========================================
// PConnect - Secure User Requests API
// Server-Side Pi Identity Verification
// Supabase Timeout + Request Protection
// ==========================================

import { createClient } from "@supabase/supabase-js";

"use strict";

const PI_API_URL = "https://api.minepi.com/v2/me";

const PI_TIMEOUT = 10000;
const SUPABASE_TIMEOUT = 10000;
const MAX_REQUESTS = 100;

// ==========================================
// RESPONSE HELPER
// ==========================================

function send(res, status, data) {
    return res.status(status).json(data);
}

// ==========================================
// VERIFY PI TOKEN
// ==========================================

async function verifyPiToken(accessToken) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        PI_TIMEOUT
    );

    try {

        const response = await fetch(
            PI_API_URL,
            {
                method: "GET",

                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json"
                },

                signal: controller.signal
            }
        );

        if (!response.ok) {
            return {
                success: false,
                timeout: false
            };
        }

        const user = await response.json();

        if (
            !user ||
            typeof user !== "object" ||
            Array.isArray(user)
        ) {
            return {
                success: false,
                timeout: false
            };
        }

        const uid =
            typeof user.uid === "string"
                ? user.uid.trim()
                : "";

        const username =
            typeof user.username === "string"
                ? user.username.trim()
                : "";

        if (
            !uid ||
            uid.length > 200 ||
            !username ||
            username.length > 50 ||
            !/^[a-zA-Z0-9._-]+$/.test(username)
        ) {
            return {
                success: false,
                timeout: false
            };
        }

        return {
            success: true,
            uid,
            username
        };

    } catch (error) {

        if (error.name === "AbortError") {
            return {
                success: false,
                timeout: true
            };
        }

        console.error(
            "Pi token verification error:",
            error.message
        );

        return {
            success: false,
            timeout: false,
            serverError: true
        };

    } finally {

        clearTimeout(timer);

    }
}

// ==========================================
// SUPABASE URL VALIDATION
// ==========================================

function validSupabaseUrl(url) {

    try {

        const parsed = new URL(url);

        return (
            parsed.protocol === "https:" &&
            /^[a-z0-9-]+\.supabase\.co$/i.test(
                parsed.hostname
            )
        );

    } catch {
        return false;
    }
}

// ==========================================
// SUPABASE FETCH TIMEOUT
// ==========================================

async function fetchWithTimeout(url, options = {}) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        SUPABASE_TIMEOUT
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

        clearTimeout(timer);

    }
}

// ==========================================
// MAIN API HANDLER
// ==========================================

export default async function handler(req, res) {

    // ==========================================
    // SECURITY HEADERS
    // ==========================================

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Authorization");

    // ==========================================
    // ONLY GET
    // ==========================================

    if (req.method !== "GET") {

        res.setHeader("Allow", "GET");

        return send(res, 405, {
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        // ==========================================
        // ENVIRONMENT VARIABLES
        // ==========================================

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;

        if (
            !supabaseUrl ||
            !supabaseSecretKey
        ) {

            console.error(
                "Missing Supabase environment variables"
            );

            return send(res, 500, {
                success: false,
                error: "Server configuration error"
            });
        }

        // ==========================================
        // VALIDATE SUPABASE URL
        // ==========================================

        if (!validSupabaseUrl(supabaseUrl)) {

            console.error(
                "Invalid Supabase URL configuration"
            );

            return send(res, 500, {
                success: false,
                error: "Server configuration error"
            });
        }

        // ==========================================
        // READ BEARER TOKEN
        // ==========================================

        const authHeader =
            typeof req.headers.authorization === "string"
                ? req.headers.authorization
                : "";

        const accessToken =
            authHeader.startsWith("Bearer ")
                ? authHeader.slice(7).trim()
                : "";

        // ==========================================
        // VALIDATE ACCESS TOKEN
        // ==========================================

        if (
            !accessToken ||
            accessToken.length < 20 ||
            accessToken.length > 4096
        ) {

            return send(res, 401, {
                success: false,
                error: "Pi authentication required"
            });
        }

        // ==========================================
        // VERIFY USER WITH PI
        // ==========================================

        const verifiedUser =
            await verifyPiToken(accessToken);

        if (verifiedUser.timeout) {

            return send(res, 504, {
                success: false,
                error: "Pi verification timed out. Please try again."
            });
        }

        if (verifiedUser.serverError) {

            return send(res, 502, {
                success: false,
                error: "Unable to verify Pi identity"
            });
        }

        if (!verifiedUser.success) {

            return send(res, 401, {
                success: false,
                error: "Invalid Pi authentication"
            });
        }

        const piUsername =
            verifiedUser.username;

        // ==========================================
        // SUPABASE CLIENT
        // ==========================================

        const supabase = createClient(
            supabaseUrl,
            supabaseSecretKey,
            {
                global: {
                    fetch: fetchWithTimeout
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        // ==========================================
        // LOAD USER REQUESTS
        // ==========================================

        const { data, error } = await supabase
            .from("requests")
            .select(
                [
                    "id",
                    "service",
                    "name",
                    "contact",
                    "details",
                    "payment",
                    "status",
                    "review_status",
                    "created_at",
                    "order_status",
                    "pi_username"
                ].join(",")
            )
            .eq("pi_username", piUsername)
            .order("created_at", {
                ascending: false
            })
            .limit(MAX_REQUESTS);

        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (error) {

            console.error(
                "Supabase requests error:",
                error.message
            );

            const timeoutError =
                error.name === "AbortError" ||
                /abort|timeout/i.test(error.message || "");

            return send(
                res,
                timeoutError ? 504 : 500,
                {
                    success: false,
                    error: timeoutError
                        ? "Request loading timed out. Please try again."
                        : "Failed to load requests"
                }
            );
        }

        // ==========================================
        // SUCCESS
        // ==========================================

        return send(res, 200, {

            success: true,

            user: {
                username: piUsername
            },

            requests: Array.isArray(data)
                ? data
                : []

        });

    } catch (error) {

        // ==========================================
        // SERVER ERROR
        // ==========================================

        console.error(
            "Requests API error:",
            error.message
        );

        return send(res, 500, {
            success: false,
            error: "Internal server error"
        });
    }
}
