// ==========================================
// PConnect - Transaction History API
// ==========================================

export default async function handler(req, res) {
    // Only GET is allowed
    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

        // Check environment variables
        if (!supabaseUrl || !supabaseSecretKey) {
            console.error("Missing Supabase environment variables");

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });
        }

        // Get transactions from Supabase
        const response = await fetch(
            `${supabaseUrl}/rest/v1/transactions?select=*&order=created_at.desc`,
            {
                method: "GET",
                headers: {
                    apikey: supabaseSecretKey,
                    Authorization: `Bearer ${supabaseSecretKey}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            console.error("Supabase transaction fetch error:", errorText);

            return res.status(response.status).json({
                success: false,
                error: "Failed to fetch transactions"
            });
        }

        const transactions = await response.json();

        return res.status(200).json({
            success: true,
            transactions
        });

    } catch (error) {
        console.error("Transaction API error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
}
