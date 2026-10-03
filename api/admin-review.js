// ==========================================
// PConnect - Admin Review API
// ==========================================

export default async function handler(req, res) {
    try {

        // Only POST is allowed
        if (req.method !== "POST") {
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
        // REQUEST DATA
        // ==========================================

        const { id, action } = req.body || {};

        if (!id) {
            return res.status(400).json({
                success: false,
                error: "Missing request id"
            });
        }

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                error: "Invalid action"
            });
        }

        // ==========================================
        // REVIEW STATUS
        // ==========================================

        const reviewStatus =
            action === "approve"
                ? "Approved"
                : "Rejected";

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
        // UPDATE REQUEST
        // ==========================================

        const response = await fetch(
            `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(id)}`,
            {
                method: "PATCH",

                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseSecretKey,
                    "Authorization":
                        `Bearer ${supabaseSecretKey}`,
                    "Prefer": "return=representation"
                },

                body: JSON.stringify({
                    review_status: reviewStatus
                })
            }
        );

        const data = await response.json();

        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!response.ok) {

            console.error(
                "Admin review error:",
                data
            );

            return res.status(response.status).json({
                success: false,
                error: "Failed to update request",
                details: data
            });
        }

        // ==========================================
        // REQUEST NOT FOUND
        // ==========================================

        if (!data || data.length === 0) {

            return res.status(404).json({
                success: false,
                error: "Request not found"
            });
        }

        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({
            success: true,
            message:
                `Request ${reviewStatus.toLowerCase()} successfully`,
            request: data[0]
        });

    } catch (error) {

        console.error(
            "Admin review API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
}
