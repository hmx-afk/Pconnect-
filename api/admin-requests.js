// ==========================================
// PConnect - Secure Admin Requests API
// Security Hardened Version
// ==========================================

import crypto from "crypto";

function setSecurityHeaders(res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
}

function isAdmin(req) {
    const suppliedKey = String(
        req.headers["x-admin-key"] || ""
    );

    const correctKey = String(
        process.env.ADMIN_REVIEW_KEY || ""
    );

    if (!suppliedKey || !correctKey) {
        return false;
    }

    const suppliedBuffer = Buffer.from(suppliedKey, "utf8");
    const correctBuffer = Buffer.from(correctKey, "utf8");

    if (suppliedBuffer.length !== correctBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        suppliedBuffer,
        correctBuffer
    );
}

export default async function handler(req, res) {
    setSecurityHeaders(res);

    // GET requests only
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    // Authenticate admin
    if (!process.env.ADMIN_REVIEW_KEY) {
        console.error("Missing ADMIN_REVIEW_KEY");

        return res.status(500).json({
            success: false,
            error: "Admin authentication is not configured"
        });
    }

    if (!isAdmin(req)) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
    }

    // Validate Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey =
        process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
        console.error(
            "Missing Supabase environment variables"
        );

        return res.status(500).json({
            success: false,
            error: "Server configuration error"
        });
    }

    // Fetch requests with a timeout
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 8000);

        let response;

        try {
            response = await fetch(
                `${supabaseUrl}/rest/v1/requests?select=*&order=created_at.desc`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": supabaseSecretKey,
                        "Authorization":
                            `Bearer ${supabaseSecretKey}`
                    },
                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            console.error(
                "Supabase admin requests returned status:",
                response.status
            );

            return res.status(502).json({
                success: false,
                error: "Failed to load requests"
            });
        }

        let data;

        try {
            data = await response.json();
        } catch (error) {
            console.error(
                "Invalid Supabase JSON response"
            );

            return res.status(502).json({
                success: false,
                error: "Invalid response from database"
            });
        }

        if (!Array.isArray(data)) {
            console.error(
                "Unexpected Supabase requests response"
            );

            return res.status(502).json({
                success: false,
                error: "Invalid response from database"
            });
        }

        return res.status(200).json({
            success: true,
            requests: data
        });

    } catch (error) {
        console.error(
            "Admin requests API error:",
            error.name || "UnknownError"
        );

        return res.status(500).json({
            success: false,
            error: error.name === "AbortError"
                ? "Database request timed out"
                : "Internal server error"
        });
    }
}
