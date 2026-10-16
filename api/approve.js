// ==========================================
// PConnect - Approve Pi Payment (checked + identity verified)
// ==========================================

const EXPECTED_AMOUNT = 0.01;

async function verifyPiToken(accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.minepi.com/v2/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const me = await response.json();

    if (!me || !me.uid || !me.username) {
      return null;
    }

    return {
      uid: String(me.uid).trim(),
      username: String(me.username).trim()
    };
  } catch (error) {
    console.error("Pi token verification error:", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

    // ---------- 0. VERIFY WHO IS CALLING ----------
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const accessToken = match ? match[1].trim() : "";

    if (!accessToken) {
      return res.status(401).json({ error: "Pi authentication required" });
    }

    const caller = await verifyPiToken(accessToken);

    if (!caller) {
      return res.status(401).json({ error: "Invalid Pi authentication" });
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

    // The payer must be the verified caller
    if (String(payment.user_uid || "").trim() !== caller.uid) {
      return res.status(403).json({ error: "Payment does not belong to this user" });
    }

    const requestId = Number(payment?.metadata?.request_id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Payment has no valid request" });
    }

    if (Number(payment.amount) !== EXPECTED_AMOUNT) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    // ---------- 2. REQUEST MUST BE APPROVED, UNPAID AND OWNED BY PAYER ----------
    const reqRes = await fetch(
      `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(requestId)}&select=id,review_status,order_status,pi_username`,
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

    if (String(request.pi_username || "").trim() !== caller.username) {
      return res.status(403).json({ error: "This request does not belong to you" });
    }

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
