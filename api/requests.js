import { createClient } from "@supabase/supabase-js";

async function verifyPiToken(accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch("https://api.minepi.com/v2/me", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            signal: controller.signal
        });

        if (!response.ok) {
            return null;
        }

        const me = await response.json();

        if (!me || !me.username) {
            return null;
        }

        return String(me.username).trim();

    } catch (err) {
        console.error("Pi token verification error:", err.message);
        return null;

    } finally {
        clearTimeout(timer);
    }
}

export default async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseSecretKey) {
            console.error("Missing Supabase environment variables");

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });
        }

        // Pi access token from the Authorization header
        const authHeader = String(req.headers.authorization || "");

        const accessToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : "";

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });
        }

        // Username comes from Pi, never from the URL
        const piUsername = await verifyPiToken(accessToken);

        if (!piUsername) {
            return res.status(401).json({
                success: false,
                error: "Invalid Pi authentication"
            });
        }

        const supabase = createClient(supabaseUrl, supabaseSecretKey);

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
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Supabase requests error:", error.message);

            return res.status(500).json({
                success: false,
                error: "Failed to load requests"
            });
        }

        return res.status(200).json({
            success: true,
            user: {
                username: piUsername
            },
            requests: Array.isArray(data) ? data : []
        });

    } catch (err) {
        console.error("Requests API error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
