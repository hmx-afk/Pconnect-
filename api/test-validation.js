// ==========================================
// PConnect - Temporary Input Validation Test
// ==========================================

export default async function handler(req, res) {

    // ONLY POST
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        const body =
            req.body || {};

        const details =
            String(
                body.details || ""
            ).trim();

        // REQUIRED
        if (!details) {
            return res.status(400).json({
                success: false,
                error: "Details are required"
            });
        }

        // TEST THE SAME LIMIT
        if (details.length > 2000) {
            return res.status(400).json({
                success: false,
                error: "Project details are too long",
                length: details.length,
                limit: 2000
            });
        }

        return res.status(200).json({
            success: true,
            message: "Validation passed",
            length: details.length,
            limit: 2000
        });

    } catch (error) {

        console.error(
            "Validation test error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
