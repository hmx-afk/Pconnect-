// ==========================================
// PConnect - Temporary Input Validation Test
// ==========================================

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        const body = req.body || {};

        const test = String(body.test || "").trim();

        // ==========================================
        // TEST DETAILS
        // ==========================================

        if (test === "details") {

            const details =
                String(body.details || "").trim();

            if (!details) {
                return res.status(400).json({
                    success: false,
                    error: "Details are required"
                });
            }

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
        }


        // ==========================================
        // TEST NAME
        // ==========================================

        if (test === "name") {

            const name =
                String(body.name || "").trim();

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "Name is required"
                });
            }

            if (name.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: "Name is too long",
                    length: name.length,
                    limit: 100
                });
            }

            return res.status(200).json({
                success: true,
                message: "Validation passed",
                length: name.length,
                limit: 100
            });
        }


        return res.status(400).json({
            success: false,
            error: "Unknown test"
        });

    } catch (error) {

        console.error("Validation test error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
