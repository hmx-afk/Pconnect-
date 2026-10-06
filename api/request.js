// ==========================================
// PConnect - Create Service Request API
// Secure Pi Identity Verification
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

        // ==========================================
        // ENVIRONMENT CHECK
        // ==========================================

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;

        if (
            !supabaseUrl ||
            !supabaseSecretKey
        ) {
            console.error(
                "Missing Supabase environment variables"
            );

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });
        }


        // ==========================================
        // READ BODY
        // ==========================================

        const body =
            req.body || {};

        const name =
            String(
                body.name || ""
            ).trim();

        const contact =
            String(
                body.contact || ""
            ).trim();

        const details =
            String(
                body.details || ""
            ).trim();

        const accessToken =
            String(
                body.accessToken || ""
            ).trim();


        // ==========================================
        // SERVICE
        // ==========================================

        const service =
            "Web Development";


        // ==========================================
        // REQUIRED FIELDS
        // ==========================================

        if (
            !name ||
            !contact ||
            !details ||
            !accessToken
        ) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }


        // ==========================================
        // INPUT LENGTH VALIDATION
        // ==========================================

        if (name.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Name is too long"
            });
        }


        if (contact.length > 150) {
            return res.status(400).json({
                success: false,
                error: "Contact is too long"
            });
        }


        if (details.length > 2000) {
            return res.status(400).json({
                success: false,
                error: "Project details are too long"
            });
        }


        // ==========================================
        // BASIC ACCESS TOKEN CHECK
        // ==========================================

        if (accessToken.length < 20) {
            return res.status(401).json({
                success: false,
                error: "Invalid Pi authentication"
            });
        }


        // ==========================================
        // VERIFY TOKEN WITH PI
        // ==========================================

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


        // ==========================================
        // PI AUTHENTICATION FAILED
        // ==========================================

        if (!piResponse.ok) {

            console.error(
                "Pi identity verification failed:",
                piResponse.status
            );

            return res.status(401).json({
                success: false,
                error: "Invalid Pi authentication"
            });
        }


        // ==========================================
        // READ VERIFIED PI USER
        // ==========================================

        const piUser =
            await piResponse.json();

        const piUid =
            String(
                piUser.uid || ""
            ).trim();

        const piUsername =
            String(
                piUser.username || ""
            ).trim();


        // ==========================================
        // VERIFY PI IDENTITY DATA
        // ==========================================

        if (
            !piUid ||
            !piUsername
        ) {

            console.error(
                "Pi verification returned incomplete identity"
            );

            return res.status(401).json({
                success: false,
                error: "Invalid Pi identity"
            });
        }


        // ==========================================
        // VERIFY USERNAME FORMAT
        // ==========================================

        if (
            piUsername.length > 50 ||
            !/^[a-zA-Z0-9._-]+$/.test(
                piUsername
            )
        ) {

            return res.status(401).json({
                success: false,
                error: "Invalid Pi identity"
            });
        }


        // ==========================================
        // SAVE REQUEST
        // ==========================================

        const response =
            await fetch(
                `${supabaseUrl}/rest/v1/requests`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "apikey":
                            supabaseSecretKey,

                        "Authorization":
                            `Bearer ${supabaseSecretKey}`,

                        "Prefer":
                            "return=representation"
                    },

                    body: JSON.stringify({

                        service,

                        name,

                        contact,

                        details,

                        // IMPORTANT:
                        // Username comes from Pi verification.
                        // We do NOT trust browser pi_username.

                        pi_username:
                            piUsername,

                        payment:
                            "Pi Network",

                        status:
                            "Submitted",

                        review_status:
                            "Waiting for review"
                    })
                }
            );


        // ==========================================
        // READ SUPABASE RESPONSE SAFELY
        // ==========================================

        let data = null;

        try {

            data =
                await response.json();

        } catch {

            data = null;
        }


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!response.ok) {

            console.error(
                "Supabase request creation failed:",
                data
            );

            return res.status(500).json({
                success: false,
                error: "Failed to save request"
            });
        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success: true,

            message:
                "Request submitted successfully",

            request:
                Array.isArray(data)
                    ? data[0]
                    : null
        });


    } catch (error) {

        // ==========================================
        // SERVER ERROR
        // ==========================================

        console.error(
            "Request API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
