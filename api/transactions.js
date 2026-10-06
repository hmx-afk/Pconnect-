// ==========================================
// PConnect - Secure Transaction History API
// 

export default async function handler(req, res) {

    res.setHeader(
        "Cache-Control",
        "no-store"
    );


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
        // PI USERNAME
        // ==========================================

        const piUsername =
            String(
                req.query?.pi_username || ""
            ).trim();


        if (!piUsername) {

            return res.status(401).json({
                success: false,
                error: "Pi username is required"
            });

        }


        // ==========================================
        // FETCH ONLY CURRENT USER TRANSACTIONS
        // ==========================================

        const encodedUsername =
            encodeURIComponent(piUsername);


        const response =
            await fetch(
                `${supabaseUrl}/rest/v1/transactions?select=request_id,amount,currency,status,service,pi_username,created_at&pi_username=eq.${encodedUsername}&order=created_at.desc&limit=100`,
                {

                    headers: {

                        apikey:
                            supabaseSecretKey,

                        Authorization:
                            `Bearer ${supabaseSecretKey}`

                    }

                }
            );


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!response.ok) {

            const errorText =
                await response.text();

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

        const transactions =
            await response.json();


        return res.status(200).json({

            success: true,

            transactions:
                Array.isArray(transactions)
                    ? transactions
                    : []

        });


    } catch (error) {

        console.error(
            "Transaction API error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });

    }

}
