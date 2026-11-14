// ==========================================
// PConnect - Secure User Requests API
// Server-Side Pi Identity Verification
// Supabase Timeout + Request Protection
// ==========================================

import { createClient } from "@supabase/supabase-js";
import { verifyPi } from "../lib/verifyPi.js";

"use strict";

const SUPABASE_TIMEOUT = 10000;
const MAX_REQUESTS = 100;

// ==========================================
// RESPONSE HELPER
// ==========================================

function send(res, status, data) {
    return res.status(status).json(data);
}

// ==========================================
// SUPABASE URL VALIDATION
// ==========================================

function validSupabaseUrl(url) {

    if (typeof url !== "string" || !url.trim()) {
        return false;
    }

    try {

        const parsed = new URL(url.trim());

        return (
            parsed.protocol === "https:" &&
            /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) &&
            !parsed.port &&
            !parsed.username &&
            !parsed.password &&
            parsed.pathname === "/" &&
            !parsed.search &&
            !parsed.hash
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
        // VERIFY USER WITH SHARED PI HELPER
        // ==========================================

        const verifiedUser = await verifyPi(req);

        if (!verifiedUser.ok) {
            return send(res, verifiedUser.status, {
                success: false,
                error: verifiedUser.error
            });
        }

        const piUsername = verifiedUser.username;

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
        // SERVER ERROR / TIMEOUT
        // ==========================================

        console.error(
            "Requests API error:",
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
                    : "Internal server error"
            }
        );
    }
}
