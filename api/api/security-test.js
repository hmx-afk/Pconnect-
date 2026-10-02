// ==========================================
// PConnect - Temporary Security Test
// ==========================================

export default async function handler(req, res) {

    try {

        if (req.method !== "POST") {

            return res.status(405).json({
                success: false,
                error: "Method not allowed"
            });

        }

        const {
            request_id
        } = req.body || {};

        const parsedRequestId =
            Number(request_id);

        if (
            !Number.isInteger(parsedRequestId) ||
            parsedRequestId <= 0
        ) {

            return res.status(400).json({
                success: false,
                error: "Invalid request_id"
            });

        }

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;

        if (
            !supabaseUrl ||
            !supabaseSecretKey
        ) {

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });

        }

        const response = await fetch(
            `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedRequestId)}&select=id,name,review_status`,
            {
                method: "GET",
                headers: {
                    "apikey": supabaseSecretKey,
                    "Authorization":
                        `Bearer ${supabaseSecretKey}`
                }
            }
        );

        const data =
            await response.json();

        if (!response.ok) {

            return res.status(500).json({
                success: false,
                error: "Could not check request"
            });

        }

        if (
            !data ||
            data.length === 0
        ) {

            return res.status(404).json({
                success: false,
                error: "Request not found"
            });

        }

        const request =
            data[0];

        if (
            request.review_status !==
            "Approved"
        ) {

            return res.status(403).json({
                success: false,
                securityCheck: "PASSED",
                message:
                    "Security check correctly blocked this non-approved request.",
                request_id:
                    request.id,
                review_status:
                    request.review_status
            });

        }

        return res.status(200).json({
            success: true,
            securityCheck: "APPROVED",
            message:
                "This request is approved.",
            request_id:
                request.id,
            review_status:
                request.review_status
        });

    } catch (error) {

        console.error(
            "Security test error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });

    }

}
