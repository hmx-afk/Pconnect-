// ==========================================
// PConnect - Secure Transaction History API
// Server-Side Pi Identity Verification
// Supabase Timeout + Security Protection
// ==========================================

"use strict";

import { createClient } from "@supabase/supabase-js";

const PI_API_URL = "https://api.minepi.com/v2/me";

const PI_TIMEOUT = 10000;
const SUPABASE_TIMEOUT = 10000;
const MAX_TRANSACTIONS = 100;

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
                success: false
            };
        }

        const user = await response.json();

        if (
            !user ||
            typeof user !== "object" ||
            Array.isArray(user)
        ) {
            return {
                success: false
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
                success: false
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
            "Pi verification error:",
            error.message
        );

        return {
            success: false,
            serverError: true
        };

    } finally {

        clearTimeout(timer);

    }
}

// ==========================================
// VALIDATE SUPABASE URL
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
        // READ AUTHORIZATION HEADER
        // ==========================================

        const authorization =
            typeof req.headers.authorization === "string"
                ? req.headers.authorization
                : "";

        const match =
            authorization.match(/^Bearer\s+(.+)$/i);

        const accessToken =
            match ? match[1].trim() : "";

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
        // VERIFY PI IDENTITY
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

        console.error(
            "Transactions API error:",
            error.message
        );

        return send(res, 500, {
            success: false,
            error: "Internal server error"
        });
    }
}
