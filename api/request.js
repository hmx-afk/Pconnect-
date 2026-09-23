export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const {
            name,
            contact,
            details
        } = req.body || {};

        const service = "Web Development";

        if (!name || !contact || !details) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const response = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/requests`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": process.env.SUPABASE_SECRET_KEY,
                    "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
                    "Prefer": "return=representation"
                },
                body: JSON.stringify({
                    service,
                    name,
                    contact,
                    details,
                    payment: "Pi Network",
                    status: "Submitted",
                    review_status: "Waiting for review"
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Supabase error:", data);

            return res.status(response.status).json({
                error: "Failed to save request",
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            message: "Request submitted successfully",
            request: data[0]
        });

    } catch (error) {
        console.error("Request API error:", error);

        return res.status(500).json({
            error: "Internal server error",
            details: error.message
        });
    }
}
