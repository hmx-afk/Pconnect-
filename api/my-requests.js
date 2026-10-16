import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        // 1. Read the Pi access token from Authorization header
        const authorization = req.headers.authorization || "";
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        const accessToken = match ? match[1].trim() : "";

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });
        }

        // 2. Verify the token directly with the Pi Platform API
        const piResponse = await fetch("https://api.minepi.com/v2/me", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        });

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

        const uid = String(piUser.uid || "").trim();
        const username = String(piUser.username || "").trim();

        if (!uid || !username) {
            return res.status(401).json({
                success: false,
                error: "Invalid Pi identity"
            });
        }

        // 3. Check Supabase environment variables
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseSecretKey) {
            console.error("Missing Supabase environment variables");

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });
        }

        // 4. Query requests belonging to the verified Pi username
        const supabase = createClient(
            supabaseUrl,
            supabaseSecretKey
        );

        const { data, error } = await supabase
            .from("requests")
            .select("*")
            .eq("pi_username", username)
            .order("created_at", {
                ascending: false
            });

        if (error) {
            console.error("Supabase requests error:", error);

            return res.status(500).json({
                success: false,
                error: "Failed to load requests"
            });
        }

        // 5. Return the verified identity and its requests
        return res.status(200).json({
            success: true,
            user: {
                uid,
                username
            },
            requests: Array.isArray(data) ? data : []
        });

    } catch (error) {
        console.error("My requests API error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
