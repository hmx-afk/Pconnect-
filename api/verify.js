import { verifyPiToken } from "../lib/verifyPi.js";

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

        const identity = await verifyPiToken(accessToken);

        if (!identity.ok) {
            return res.status(identity.status).json({
                success: false,
                error: identity.error
            });
        }

        const { uid, username } = identity;


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
