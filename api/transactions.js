// ==========================================
// PConnect - Transaction History API
// ==========================================

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !key) {
      console.error("Missing Supabase environment variables");
      return res.status(500).json({ success: false, error: "Server configuration error" });
    }

    // Public-safe columns only: no username, txid or payment id.
    const response = await fetch(
      `${supabaseUrl}/rest/v1/transactions?select=request_id,amount,currency,status,service,created_at&order=created_at.desc&limit=100`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );

    if (!response.ok) {
      console.error("Supabase transaction fetch error:", await response.text());
      return res.status(500).json({ success: false, error: "Failed to fetch transactions" });
    }

    const transactions = await response.json();
    return res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error("Transaction API error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
