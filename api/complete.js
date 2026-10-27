// ==========================================
// PConnect - Complete Pi Payment
// Identity + Payment Verified + Safe Status Update
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
    // ---------- ONLY POST ----------
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const {
      paymentId,
      txid,
      request_id = null
    } = req.body || {};

    if (!paymentId || typeof paymentId !== "string") {
      return res.status(400).json({
        error: "Missing paymentId"
      });
    }

    if (!txid || typeof txid !== "string") {
      return res.status(400).json({
        error: "Missing txid"
      });
    }

    // ---------- CONFIG ----------
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const piApiKey = process.env.PI_API_KEY;

    if (!supabaseUrl || !supabaseSecretKey || !piApiKey) {
      console.error("Missing environment variables");

      return res.status(500).json({
        error: "Server configuration error"
      });
    }

    const piHeaders = {
      Authorization: `Key ${piApiKey}`
    };

    const supabaseHeaders = {
      "Content-Type": "application/json",
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`
    };

    // ---------- 0. VERIFY CALLER ----------
    const authorization = String(
      req.headers.authorization || ""
    );

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const accessToken = match ? match[1].trim() : "";

    if (!accessToken) {
      return res.status(401).json({
        error: "Pi authentication required"
      });
    }

    const caller = await verifyPiToken(accessToken);

    if (!caller) {
      return res.status(401).json({
        error: "Invalid Pi authentication"
      });
    }

    // ---------- 1. READ PAYMENT FROM PI ----------
    const piGet = await fetch(
      `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: piHeaders
      }
    );

    const payment = await piGet.json();

    if (!piGet.ok) {
      console.error("Pi payment lookup error:", payment);

      return res.status(404).json({
        error: "Payment not found"
      });
    }

    // Payment must belong to the authenticated user.
    if (String(payment.user_uid || "").trim() !== caller.uid) {
      return res.status(403).json({
        error: "Payment does not belong to this user"
      });
    }

    // Request ID must come from Pi payment metadata.
    const parsedRequestId = Number(
      payment?.metadata?.request_id
    );

    if (
      !Number.isInteger(parsedRequestId) ||
      parsedRequestId <= 0
    ) {
      return res.status(400).json({
        error: "Payment has no valid request"
      });
    }

    if (
      request_id !== null &&
      request_id !== undefined &&
      request_id !== "" &&
      Number(request_id) !== parsedRequestId
    ) {
      return res.status(400).json({
        error: "Request mismatch"
      });
    }

    if (Number(payment.amount) !== EXPECTED_AMOUNT) {
      return res.status(400).json({
        error: "Invalid payment amount"
      });
    }

    const piStatus = payment.status || {};

    if (piStatus.cancelled || piStatus.user_cancelled) {
      return res.status(409).json({
        error: "Payment was cancelled"
      });
    }

    if (!piStatus.developer_approved) {
      return res.status(409).json({
        error: "Payment was not approved"
      });
    }

    // ---------- 2. VERIFY REQUEST ----------
    const requestUrl =
      `${supabaseUrl}/rest/v1/requests` +
      `?id=eq.${encodeURIComponent(parsedRequestId)}`;

    const requestResponse = await fetch(
      `${requestUrl}&select=id,service,review_status,order_status,pi_username`,
      {
        method: "GET",
        headers: supabaseHeaders
      }
    );

    const requestData = await requestResponse.json();

    if (!requestResponse.ok) {
      console.error(
        "Request verification error:",
        requestData
      );

      return res.status(500).json({
        error: "Could not verify service request"
      });
    }

    if (!requestData || requestData.length === 0) {
      return res.status(404).json({
        error: "Service request not found"
      });
    }

    const approvedRequest = requestData[0];

    if (approvedRequest.review_status !== "Approved") {
      return res.status(403).json({
        error: "This service request has not been approved"
      });
    }

    const requestOwner = String(
      approvedRequest.pi_username || ""
    ).trim();

    if (!requestOwner || requestOwner !== caller.username) {
      return res.status(403).json({
        error: "Request owner mismatch"
      });
    }

    const service =
      approvedRequest.service || "Web Development";

    // ---------- HELPER: READ CURRENT REQUEST ----------
    async function getCurrentRequest() {
      const response = await fetch(
        `${requestUrl}&select=id,service,review_status,order_status,pi_username`,
        {
          method: "GET",
          headers: supabaseHeaders
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Current request lookup error:", data);

        return {
          ok: false,
          row: null
        };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return {
          ok: false,
          row: null
        };
      }

      return {
        ok: true,
        row: data[0]
      };
    }

    // ---------- HELPER: MARK PAID SAFELY ----------
    async function markPaid() {
      /*
       * Only update if the request is still:
       * - Approved
       * - Pending
       *
       * This prevents overwriting a status that another
       * operation changed after the initial request lookup.
       */

      const updateUrl =
        `${requestUrl}` +
        `&review_status=eq.Approved` +
        `&order_status=eq.Pending`;

      const response = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          ...supabaseHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          order_status: "Paid"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Order status update error:", data);

        return {
          ok: false,
          row: null
        };
      }

      // The conditional update succeeded.
      if (Array.isArray(data) && data.length > 0) {
        return {
          ok: true,
          skipped: false,
          row: data[0]
        };
      }

      /*
       * No row was updated. The status may have changed
       * between the initial read and this update.
       * Read the current status instead of forcing Paid.
       */
      const latest = await getCurrentRequest();

      if (!latest.ok) {
        return {
          ok: false,
          row: null
        };
      }

      /*
       * If another request already marked it Paid,
       * return the latest row without changing it again.
       */
      if (
        latest.row.review_status === "Approved" &&
        latest.row.order_status === "Paid"
      ) {
        return {
          ok: true,
          skipped: true,
          row: latest.row
        };
      }

      /*
       * Do not overwrite In Progress, Completed,
       * Cancelled, or any other unexpected status.
       */
      return {
        ok: false,
        row: latest.row
      };
    }

    // ---------- HELPER: HANDLE EXISTING TRANSACTION ----------
    async function respondWithExisting(existing) {
      if (Number(existing.request_id) !== parsedRequestId) {
        return res.status(409).json({
          error: "Payment belongs to another request"
        });
      }

      if (
        String(existing.pi_username || "") !== requestOwner
      ) {
        return res.status(409).json({
          error: "Payment user does not match request owner"
        });
      }

      const paid = await markPaid();

      if (!paid.ok) {
        return res.status(409).json({
          error:
            "Payment already completed, but request status needs review",
          transaction: existing,
          request: paid.row
        });
      }

      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: "Payment was already completed",
        transaction: existing,
        request: paid.row
      });
    }

    // ---------- 3. DUPLICATE PAYMENT CHECK ----------
    const duplicateResponse = await fetch(
      `${supabaseUrl}/rest/v1/transactions` +
      `?payment_id=eq.${encodeURIComponent(paymentId)}` +
      `&select=*`,
      {
        method: "GET",
        headers: supabaseHeaders
      }
    );

    const duplicateData = await duplicateResponse.json();

    if (!duplicateResponse.ok) {
      console.error(
        "Duplicate transaction check error:",
        duplicateData
      );

      return res.status(500).json({
        error: "Could not verify existing transaction"
      });
    }

    if (
      Array.isArray(duplicateData) &&
      duplicateData.length > 0
    ) {
      return respondWithExisting(duplicateData[0]);
    }

    // ---------- 4. COMPLETE PAYMENT WITH PI ----------
    let piData = payment;

    if (!piStatus.developer_completed) {
      const piResponse = await fetch(
        `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`,
        {
          method: "POST",
          headers: {
            ...piHeaders,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            txid
          })
        }
      );

      piData = await piResponse.json();

      if (!piResponse.ok) {
        console.error("Pi completion error:", piData);

        return res.status(piResponse.status).json({
          error: "Pi payment completion failed"
        });
      }
    }

    // ---------- 5. SAVE TRANSACTION ----------
    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/transactions`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          payment_id: paymentId,
          txid,
          amount: EXPECTED_AMOUNT,
          currency: "Pi",
          pi_username: requestOwner,
          service,
          status: "Completed",
          request_id: parsedRequestId
        })
      }
    );

    const supabaseData = await supabaseResponse.json();

    // ---------- UNIQUE PAYMENT CONFLICT ----------
    if (
      !supabaseResponse.ok &&
      supabaseData &&
      supabaseData.code === "23505"
    ) {
      console.warn(
        "Duplicate payment prevented by database:",
        paymentId
      );

      const existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/transactions` +
        `?payment_id=eq.${encodeURIComponent(paymentId)}` +
        `&select=*`,
        {
          method: "GET",
          headers: supabaseHeaders
        }
      );

      const existingData = await existingResponse.json();

      if (
        existingResponse.ok &&
        Array.isArray(existingData) &&
        existingData.length > 0
      ) {
        return respondWithExisting(existingData[0]);
      }

      return res.status(409).json({
        success: false,
        error: "Duplicate payment detected"
      });
    }

    // ---------- OTHER SUPABASE ERROR ----------
    if (!supabaseResponse.ok) {
      console.error(
        "Transaction save error:",
        supabaseData
      );

      return res.status(500).json({
        error:
          "Payment completed, but transaction could not be saved"
      });
    }

    // ---------- 6. UPDATE ORDER STATUS SAFELY ----------
    const paid = await markPaid();

    if (!paid.ok) {
      return res.status(409).json({
        error:
          "Payment completed and transaction saved, but request status needs review",
        transaction: supabaseData[0],
        request: paid.row
      });
    }

    // ---------- SUCCESS ----------
    return res.status(200).json({
      success: true,
      message:
        "Payment completed, transaction saved, and request status verified",
      payment: piData,
      transaction: supabaseData[0],
      request: paid.row
    });

  } catch (error) {
    console.error("Complete error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
