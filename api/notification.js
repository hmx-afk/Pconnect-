// ==========================================
// PConnect - Notifications API
// ==========================================

export default async function handler(req, res) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
        const adminReviewKey = process.env.ADMIN_REVIEW_KEY;

        if (!supabaseUrl || !supabaseSecretKey) {
            return res.status(500).json({
                success: false,
                error: "Missing Supabase environment variables"
            });
        }

        const endpoint =
            `${supabaseUrl}/rest/v1/notifications`;

        const headers = {
            apikey: supabaseSecretKey,
            Authorization: `Bearer ${supabaseSecretKey}`,
            "Content-Type": "application/json"
        };

        // ==========================================
        // GET - Load notifications
        // ==========================================

        if (req.method === "GET") {

            const piUsername =
                String(req.query?.pi_username || "").trim();

            if (!piUsername) {
                return res.status(400).json({
                    success: false,
                    error: "pi_username is required"
                });
            }

            const response = await fetch(
                `${endpoint}?select=*&pi_username=eq.${encodeURIComponent(piUsername)}&order=created_at.desc`,
                {
                    method: "GET",
                    headers
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error(
                    "Supabase notifications GET error:",
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error: "Failed to load notifications"
                });
            }

            return res.status(200).json({
                success: true,
                notifications: data || []
            });
        }

        // ==========================================
        // POST - Create notification
        // Admin only
        // ==========================================

        if (req.method === "POST") {

            const requestAdminKey =
                req.headers["x-admin-key"];

            if (
                !adminReviewKey ||
                !requestAdminKey ||
                requestAdminKey !== adminReviewKey
            ) {
                return res.status(401).json({
                    success: false,
                    error: "Unauthorized"
                });
            }

            const body = req.body || {};

            const requestId = Number(body.request_id);

            const piUsername =
                String(body.pi_username || "").trim();

            const type =
                String(body.type || "").trim();

            const title =
                String(body.title || "").trim();

            const message =
                String(body.message || "").trim();

            if (
                !Number.isInteger(requestId) ||
                requestId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Valid request_id is required"
                });
            }

            if (
                !piUsername ||
                !type ||
                !title ||
                !message
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "pi_username, type, title and message are required"
                });
            }

            const response = await fetch(
                endpoint,
                {
                    method: "POST",

                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },

                    body: JSON.stringify({
                        request_id: requestId,
                        pi_username: piUsername,
                        type,
                        title,
                        message
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error(
                    "Supabase notifications POST error:",
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error: "Failed to create notification",
                    details: data
                });
            }

            return res.status(201).json({
                success: true,
                notification: data?.[0] || data
            });
        }

        // ==========================================
        // PATCH - Mark notification as read
        // ==========================================

        if (req.method === "PATCH") {

            const body = req.body || {};

            const id = Number(body.id);

            const piUsername =
                String(body.pi_username || "").trim();

            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !piUsername
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Valid id and pi_username are required"
                });
            }

            const response = await fetch(
                `${endpoint}?id=eq.${encodeURIComponent(id)}&pi_username=eq.${encodeURIComponent(piUsername)}`,
                {
                    method: "PATCH",

                    headers: {
                        ...headers,
                        Prefer: "return=representation"
                    },

                    body: JSON.stringify({
                        is_read: true
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                console.error(
                    "Supabase notification PATCH error:",
                    data
                );

                return res.status(response.status).json({
                    success: false,
                    error: "Failed to mark notification as read"
                });
            }

            if (!data || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: "Notification not found"
                });
            }

            return res.status(200).json({
                success: true,
                notification: data[0]
            });
        }

        // ==========================================
        // Method not allowed
        // ==========================================

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    } catch (error) {

        console.error(
            "Notifications API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
}
