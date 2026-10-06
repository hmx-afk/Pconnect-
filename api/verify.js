// ==========================================
// PConnect - Verify Pi User Access Token
// Server-Side Pi Identity Verification
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
        // READ ACCESS TOKEN
        // ==========================================

        const body =
            req.body || {};

        const accessToken =
            String(
                body.accessToken || ""
            ).trim();


        // ==========================================
        // VALIDATE TOKEN
        // ==========================================

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });
        }


        // ==========================================
        // VERIFY WITH PI PLATFORM API
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
        // INVALID TOKEN
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
        // READ VERIFIED USER
        // ==========================================

        const user =
            await piResponse.json();


        const uid =
            String(
                user.uid || ""
            ).trim();

        const username =
            String(
                user.username || ""
            ).trim();


        // ==========================================
        // VERIFY REQUIRED IDENTITY DATA
        // ==========================================

        if (!uid || !username) {

            console.error(
                "Pi verification returned incomplete user data"
            );

            return res.status(401).json({
                success: false,
                error: "Invalid Pi identity"
            });
        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success: true,

            user: {
                uid,
                username
            }

        });

    } catch (error) {

        // ==========================================
        // SERVER ERROR
        // ==========================================

        console.error(
            "Pi verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
