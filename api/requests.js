export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const response = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/requests?select=*&order=created_at.desc`,
            {
                method: "GET",
                headers: {
                    "apikey": process.env.SUPABASE_SECRET_KEY,
                    "Authorization": `Bearer ${process.env.SUPABASE_SECRET_KEY}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Supabase error:", data);

            return res.status(response.status).json({
                error: "Failed to load requests",
                details: data
            });
        }

        return res.status(200).json({
            success: true,
            requests: data
        });

    } catch (error) {
        console.error("Requests API error:", error);

        return res.status(500).json({
            error: "Internal server error",
            details: error.message
        });
    }
}
