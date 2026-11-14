// ==========================================
// PConnect - Secure Transaction History API
// Server-Side Pi Identity Verification
// Supabase Timeout + Security Protection
// ==========================================

"use strict";

import { createClient } from "@supabase/supabase-js";
import { verifyPi } from "../lib/verifyPi.js";

const SUPABASE_TIMEOUT = 10000;
const MAX_TRANSACTIONS = 100;

// ==========================================
// RESPONSE HELPER
// ==========================================

function send(res, status, data) {
    return res.status(status).json(data);
}

// ==========================================
// VALIDATE SUPABASE URL
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
        // CREATE SUPABASE CLIENT
        // ==========================================

        const supabase = createClient(
            supabaseUrl,
            supabaseSecretKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        // ==========================================
        // SUPABASE QUERY TIMEOUT
        // ==========================================

        const controller = new AbortController();

        const timer = setTimeout(
            () => controller.abort(),
            SUPABASE_TIMEOUT
        );

        let result;

        try {

            result = await supabase
                .from("transactions")
                .select([
                    "request_id",
                    "amount",
                    "currency",
                    "status",
                    "service",
                    "pi_username",
                    "created_at"
                ].join(","))
                .eq("pi_username", piUsername)
                .order("created_at", {
                    ascending: false
                })
                .limit(MAX_TRANSACTIONS)
                .abortSignal(controller.signal);

        } finally {

            clearTimeout(timer);

        }

        const { data, error } = result;

        // ==========================================
        // HANDLE SUPABASE ERROR
        // ==========================================

        if (error) {

            console.error(
                "Supabase transactions error:",
                error.message
            );

            const timedOut =
                error.name === "AbortError" ||
                /abort|timeout/i.test(
                    error.message || ""
                );

            return send(
                res,
                timedOut ? 504 : 500,
                {
                    success: false,
                    error: timedOut
                        ? "Transaction loading timed out. Please try again."
                        : "Failed to load transactions"
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

            transactions: Array.isArray(data)
                ? data
                : []

        });

    } catch (error) {

        const timedOut =
            error?.name === "AbortError" ||
            /abort|timeout/i.test(error?.message || "");

        console.error(
            "Transactions API error:",
            error?.message || "Unknown error"
        );

        return send(
            res,
            timedOut ? 504 : 500,
            {
                success: false,
                error: timedOut
                    ? "Transaction loading timed out. Please try again."
                    : "Internal server error"
            }
        );
    }
}
