// ==========================================
// PConnect - Temporary Input Validation Test
// ==========================================

export default async function handler(req, res) {

    // ==========================================
    // ONLY POST
    // ==========================================

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        const body = req.body || {};

        const test =
            String(body.test || "").trim();


        // ==========================================
        // TEST 1/2/3 — DETAILS
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
        // TEST 4 — NAME
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


        // ==========================================
        // TEST 5 — CONTACT
        // ==========================================

        if (test === "contact") {

            const contact =
                String(body.contact || "").trim();

            if (!contact) {
                return res.status(400).json({
                    success: false,
                    error: "Contact is required"
                });
            }

            if (contact.length > 150) {
                return res.status(400).json({
                    success: false,
                    error: "Contact is too long",
                    length: contact.length,
                    limit: 150
                });
            }

            return res.status(200).json({
                success: true,
                message: "Validation passed",
                length: contact.length,
                limit: 150
            });
        }


        // ==========================================
        // TEST 6 — MISSING PI ACCESS TOKEN
        // ==========================================

        if (test === "accessToken") {

            const accessToken =
                String(body.accessToken || "").trim();

            if (!accessToken) {
                return res.status(401).json({
                    success: false,
                    error: "Pi authentication required"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Access token provided"
            });
        }


        // ==========================================
        // TEST 7 — INVALID PI ACCESS TOKEN
        // ==========================================

        if (test === "invalidAccessToken") {

            const accessToken =
                String(body.accessToken || "").trim();

            if (!accessToken) {
                return res.status(401).json({
                    success: false,
                    error: "Pi authentication required"
                });
            }

            const piResponse =
                await fetch(
                    "https://api.minepi.com/v2/me",
                    {
                        method: "GET",
                        headers: {
                            "Authorization":
                                `Bearer ${accessToken}`
                        }
                    }
                );

            if (!piResponse.ok) {
                return res.status(401).json({
                    success: false,
                    error: "Invalid Pi authentication"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Pi authentication valid"
            });
        }


        // ==========================================
        // UNKNOWN TEST
        // ==========================================

        return res.status(400).json({
            success: false,
            error: "Unknown test"
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
