// ==========================================
// PConnect - Secure User Requests API
// Server-Side Pi Identity Verification
// ==========================================

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    // ==========================================
    // GET ONLY
    // ==========================================

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        // ==========================================
        // CHECK SERVER CONFIGURATION
        // ==========================================

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

        // ==========================================
        // REQUIRE PI ACCESS TOKEN
        // ==========================================

        const authorization =
            req.headers.authorization || "";

        const match = authorization.match(/^Bearer\s+(.+)$/i);

        if (!match) {
            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });
        }

        const accessToken = match[1].trim();

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });
        }

        // ==========================================
        // VERIFY IDENTITY WITH PI SERVER
        // ==========================================

        const piResponse = await fetch(
            "https://api.minepi.com/v2/me",
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        if (!piResponse.ok) {
            console.error(
                "Pi identity verification failed:",
                piResponse.status
            );

            return res.status(401).json({
                success: false,
                error: "Invalid Pi authentication"
            });
        }

        const piUser = await piResponse.json();

        const verifiedUsername =
            String(piUser.username || "").trim();

        const verifiedUid =
            String(piUser.uid || "").trim();

        if (!verifiedUsername || !verifiedUid) {
            console.error(
                "Pi verification returned incomplete identity"
            );

            return res.status(401).json({
                success: false,
                error: "Invalid Pi identity"
            });
        }

        // ==========================================
        // CONNECT TO SUPABASE
        // ==========================================

        const supabase = createClient(
            supabaseUrl,
            supabaseSecretKey
        );

        // ==========================================
        // FETCH ONLY THIS VERIFIED PI USER'S REQUESTS
        // Do not trust username from query parameters.
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
            .eq("pi_username", verifiedUsername)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error(
                "Supabase requests error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                error: "Failed to load requests"
            });
        }

        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({
            success: true,
            user: {
                username: verifiedUsername
            },
            requests: Array.isArray(data) ? data : []
        });

    } catch (error) {
        console.error(
            "Secure requests API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
