// ==========================================
// PConnect - Secure Admin Requests API
// ==========================================

export default async function handler(req, res) {
    try {

        // ==========================================
        // ONLY GET ALLOWED
        // ==========================================

        if (req.method !== "GET") {
            return res.status(405).json({
                success: false,
                error: "Method not allowed"
            });
        }

        // ==========================================
        // ADMIN AUTHENTICATION
        // ==========================================

        const adminKey = req.headers["x-admin-key"];
        const correctAdminKey = process.env.ADMIN_REVIEW_KEY;

        if (!correctAdminKey) {
            console.error("Missing ADMIN_REVIEW_KEY");

            return res.status(500).json({
                success: false,
                error: "Admin authentication is not configured"
            });
        }

        if (!adminKey || adminKey !== correctAdminKey) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        // ==========================================
        // SUPABASE CONFIG
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
        // GET REQUESTS
        // ==========================================

        const response = await fetch(
            `${supabaseUrl}/rest/v1/requests?select=*&order=created_at.desc`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseSecretKey,
                    "Authorization":
                        `Bearer ${supabaseSecretKey}`
                }
            }
        );

        const data = await response.json();

        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!response.ok) {
            console.error(
                "Admin requests error:",
                data
            );

            return res.status(response.status).json({
                success: false,
                error: "Failed to load requests",
                details: data
            });
        }

        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({
            success: true,
            requests: data || []
        });

    } catch (error) {

        console.error(
            "Admin requests API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
}
