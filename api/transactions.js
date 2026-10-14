// ==========================================
// PConnect - Secure Transaction History API
// Server-Side Pi Identity Verification
// ==========================================

async function verifyPiToken(accessToken) {

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {

        const response = await fetch(
            "https://api.minepi.com/v2/me",
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            return null;
        }

        const me = await response.json();

        if (!me || !me.username) {
            return null;
        }

        return String(me.username).trim();

    } catch (error) {

        console.error(
            "Pi token verification error:",
            error.message
        );

        return null;

    } finally {

        clearTimeout(timer);

    }

}


export default async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");


    // ==========================================
    // ONLY GET
    // ==========================================

    if (req.method !== "GET") {

        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });

    }


    try {

        // ==========================================
        // SUPABASE CONFIG
        // ==========================================

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseSecretKey) {

            console.error("Missing Supabase environment variables");

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });

        }


        // ==========================================
        // REQUIRE PI ACCESS TOKEN
        // ==========================================

        const authorization = String(req.headers.authorization || "");

        const match = authorization.match(/^Bearer\s+(.+)$/i);

        const accessToken = match ? match[1].trim() : "";

        if (!accessToken) {

            return res.status(401).json({
                success: false,
                error: "Pi authentication required"
            });

        }


        // ==========================================
        // VERIFY IDENTITY WITH PI SERVER
        // The username from the URL is never trusted.
        // ==========================================

        const verifiedUsername = await verifyPiToken(accessToken);

        if (!verifiedUsername) {

            return res.status(401).json({
                success: false,
                error: "Invalid Pi authentication"
            });

        }


        // ==========================================
        // FETCH ONLY THIS VERIFIED USER'S TRANSACTIONS
        // ==========================================

        const encodedUsername = encodeURIComponent(verifiedUsername);

        const response = await fetch(
            `${supabaseUrl}/rest/v1/transactions?select=request_id,amount,currency,status,service,pi_username,created_at&pi_username=eq.${encodedUsername}&order=created_at.desc&limit=100`,
            {
                headers: {
                    apikey: supabaseSecretKey,
                    Authorization: `Bearer ${supabaseSecretKey}`
                }
            }
        );


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!response.ok) {

            const errorText = await response.text();

            console.error(
                "Supabase transaction fetch error:",
                errorText
            );

            return res.status(500).json({
                success: false,
                error: "Failed to fetch transactions"
            });

        }


        // ==========================================
        // RESPONSE
        // ==========================================

        const transactions = await response.json();

        return res.status(200).json({
            success: true,
            user: {
                username: verifiedUsername
            },
            transactions: Array.isArray(transactions)
                ? transactions
                : []
        });

    } catch (error) {

        console.error("Transaction API error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });

    }

}
