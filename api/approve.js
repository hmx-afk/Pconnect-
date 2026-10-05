// ==========================================
// PConnect - Approve Pi Payment (checked)
// ==========================================

const EXPECTED_AMOUNT = 0.01;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { paymentId } = req.body || {};
    if (!paymentId || typeof paymentId !== "string") {
      return res.status(400).json({ error: "Missing paymentId" });
    }

    const piApiKey = process.env.PI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!piApiKey || !supabaseUrl || !supabaseKey) {
      console.error("Missing environment variables");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const piHeaders = { Authorization: `Key ${piApiKey}` };
    const sbHeaders = {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    };

    // ---------- 1. READ PAYMENT FROM PI ----------
    const piGet = await fetch(
      `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET", headers: piHeaders }
    );
    const payment = await piGet.json();

    if (!piGet.ok) {
      console.error("Pi payment lookup error:", payment);
      return res.status(404).json({ error: "Payment not found" });
    }

    const requestId = Number(payment?.metadata?.request_id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Payment has no valid request" });
    }

    if (Number(payment.amount) !== EXPECTED_AMOUNT) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    // ---------- 2. REQUEST MUST BE APPROVED AND UNPAID ----------
    const reqRes = await fetch(
      `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(requestId)}&select=id,review_status,order_status`,
      { method: "GET", headers: sbHeaders }
    );
    const reqData = await reqRes.json();

    if (!reqRes.ok) {
      console.error("Request lookup error:", reqData);
      return res.status(500).json({ error: "Could not verify request" });
    }
    if (!reqData || reqData.length === 0) {
      return res.status(404).json({ error: "Service request not found" });
    }

    const request = reqData[0];

    if (request.review_status !== "Approved") {
      return res.status(403).json({ error: "This request has not been approved" });
    }

    if (request.order_status && request.order_status !== "Pending") {
      return res.status(409).json({ error: "This request has already been paid" });
    }

    // ---------- 3. NO EXISTING TRANSACTION FOR THIS REQUEST ----------
    const txRes = await fetch(
      `${supabaseUrl}/rest/v1/transactions?request_id=eq.${encodeURIComponent(requestId)}&select=id&limit=1`,
      { method: "GET", headers: sbHeaders }
    );
    const txData = await txRes.json();

    if (!txRes.ok) {
      console.error("Transaction lookup error:", txData);
      return res.status(500).json({ error: "Could not verify payments" });
    }
    if (txData && txData.length > 0) {
      return res.status(409).json({ error: "This request has already been paid" });
    }

    // ---------- 4. ALREADY APPROVED BY US (retry) ----------
    if (payment.status && payment.status.developer_approved) {
      return res.status(200).json({ success: true, alreadyApproved: true });
    }

    // ---------- 5. APPROVE WITH PI ----------
    const approveRes = await fetch(
      `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`,
      { method: "POST", headers: piHeaders }
    );
    const approveData = await approveRes.json();

    if (!approveRes.ok) {
      console.error("Pi approve error:", approveData);
      return res.status(approveRes.status).json({ error: "Pi approval failed" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Approve error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
