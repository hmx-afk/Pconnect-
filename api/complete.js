// ==========================================
// PConnect - Complete Pi Payment
// ==========================================

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    // ==========================================
    // ONLY POST
    // ==========================================

    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const {
      paymentId,
      txid,
      amount = 0.01,
      pi_username = null,
      request_id = null
    } = req.body || {};

    // ==========================================
    // VALIDATION
    // ==========================================

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

    if (
      request_id === null ||
      request_id === undefined ||
      request_id === ""
    ) {
      return res.status(400).json({
        error: "Missing request_id"
      });
    }

    const parsedRequestId = Number(request_id);

    if (
      !Number.isInteger(parsedRequestId) ||
      parsedRequestId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid request_id"
      });
    }

    if (
      pi_username !== null &&
      typeof pi_username !== "string"
    ) {
      return res.status(400).json({
        error: "Invalid pi_username"
      });
    }

    const submittedUsername =
      String(pi_username || "").trim().slice(0, 100);

    if (!submittedUsername) {
      return res.status(400).json({
        error: "Missing pi_username"
      });
    }

    // ==========================================
    // CONFIG
    // ==========================================

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    const piApiKey =
      process.env.PI_API_KEY;

    if (
      !supabaseUrl ||
      !supabaseSecretKey ||
      !piApiKey
    ) {
      console.error(
        "Missing environment variables"
      );

      return res.status(500).json({
        error: "Server configuration error"
      });
    }

    const supabaseHeaders = {
      "Content-Type": "application/json",
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`
    };

    const requestUrl =
      `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(
        parsedRequestId
      )}`;

    // ==========================================
    // 1. VERIFY REQUEST
    // ==========================================

    const requestResponse = await fetch(
      `${requestUrl}&select=id,service,review_status,order_status,pi_username`,
      {
        method: "GET",
        headers: supabaseHeaders
      }
    );

    const requestData =
      await requestResponse.json();

    if (!requestResponse.ok) {
      console.error(
        "Request verification error:",
        requestData
      );

      return res.status(500).json({
        error: "Could not verify service request"
      });
    }

    if (
      !requestData ||
      requestData.length === 0
    ) {
      return res.status(404).json({
        error: "Service request not found"
      });
    }

    const approvedRequest =
      requestData[0];

    // ==========================================
    // REQUEST MUST BE APPROVED
    // ==========================================

    if (
      approvedRequest.review_status !==
      "Approved"
    ) {
      return res.status(403).json({
        error:
          "This service request has not been approved"
      });
    }

    // ==========================================
    // VERIFY REQUEST OWNER
    // ==========================================

    const requestOwner =
      String(
        approvedRequest.pi_username || ""
      ).trim();

    if (!requestOwner) {
      return res.status(400).json({
        error:
          "This service request has no Pi username"
      });
    }

    if (
      requestOwner !== submittedUsername
    ) {
      return res.status(403).json({
        error: "Request owner mismatch"
      });
    }

    const service =
      approvedRequest.service ||
      "Web Development";

    // ==========================================
    // HELPER: MARK PAID
    // NEVER DOWNGRADE ORDER STATUS
    // ==========================================

    async function markPaid() {
      const current =
        approvedRequest.order_status;

      if (
        current &&
        current !== "Pending"
      ) {
        return {
          ok: true,
          skipped: true,
          row: approvedRequest
        };
      }

      const r = await fetch(
        requestUrl,
        {
          method: "PATCH",
          headers: {
            ...supabaseHeaders,
            Prefer:
              "return=representation"
          },
          body: JSON.stringify({
            order_status: "Paid"
          })
        }
      );

      const d =
        await r.json();

      if (!r.ok) {
        console.error(
          "Order status update error:",
          d
        );

        return {
          ok: false
        };
      }

      return {
        ok: true,
        skipped: false,
        row: d[0]
      };
    }

    // ==========================================
    // 2. DUPLICATE PAYMENT CHECK
    // ==========================================

    const duplicateResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${encodeURIComponent(
          paymentId
        )}&select=*`,
        {
          method: "GET",
          headers: supabaseHeaders
        }
      );

    const duplicateData =
      await duplicateResponse.json();

    if (!duplicateResponse.ok) {
      console.error(
        "Duplicate transaction check error:",
        duplicateData
      );

      return res.status(500).json({
        error:
          "Could not verify existing transaction"
      });
    }

    if (
      duplicateData &&
      duplicateData.length > 0
    ) {
      const existing =
        duplicateData[0];

      // ==========================================
      // PAYMENT MUST BELONG TO SAME REQUEST
      // ==========================================

      if (
        Number(existing.request_id) !==
        parsedRequestId
      ) {
        return res.status(409).json({
          error:
            "Payment belongs to another request"
        });
      }

      // ==========================================
      // TRANSACTION USER MUST MATCH REQUEST OWNER
      // ==========================================

      if (
        String(existing.pi_username || "") !==
        requestOwner
      ) {
        return res.status(409).json({
          error:
            "Payment user does not match request owner"
        });
      }

      const paid =
        await markPaid();

      if (!paid.ok) {
        return res.status(500).json({
          error:
            "Payment already completed, but request status could not be updated"
        });
      }

      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message:
          "Payment was already completed",
        transaction: existing,
        request: paid.row
      });
    }

    // ==========================================
    // 3. COMPLETE PAYMENT WITH PI
    // ==========================================

    const piResponse =
      await fetch(
        `https://api.minepi.com/v2/payments/${encodeURIComponent(
          paymentId
        )}/complete`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Key ${piApiKey}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            txid
          })
        }
      );

    const piData =
      await piResponse.json();

    if (!piResponse.ok) {
      console.error(
        "Pi completion error:",
        piData
      );

      return res.status(
        piResponse.status
      ).json({
        error:
          "Pi payment completion failed"
      });
    }

    // ==========================================
    // 4. CONFIRMED PAYMENT AMOUNT
    // ==========================================

    const piAmount =
      Number(
        piData &&
        piData.amount
      );

    const browserAmount =
      Number(amount);

    // Prefer Pi-confirmed amount.
    // Browser amount is only a fallback for
    // compatibility with the existing payment flow.
    const confirmedAmount =
      Number.isFinite(piAmount) &&
      piAmount > 0
        ? piAmount
        : (
            Number.isFinite(browserAmount) &&
            browserAmount > 0
              ? browserAmount
              : 0.01
          );

    // ==========================================
    // 5. SAVE TRANSACTION
    // ==========================================

    const supabaseResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/transactions`,
        {
          method: "POST",
          headers: {
            ...supabaseHeaders,
            Prefer:
              "return=representation"
          },
          body: JSON.stringify({
            payment_id: paymentId,
            txid,
            amount: confirmedAmount,
            currency: "Pi",

            // IMPORTANT:
            // Use verified username from DB.
            pi_username: requestOwner,

            service,
            status: "Completed",
            request_id:
              parsedRequestId
          })
        }
      );

    const supabaseData =
      await supabaseResponse.json();

    // ==========================================
    // UNIQUE PAYMENT CONFLICT
    // ==========================================

    if (
      !supabaseResponse.ok &&
      supabaseData &&
      supabaseData.code === "23505"
    ) {
      console.warn(
        "Duplicate payment prevented by database:",
        paymentId
      );

      const existingResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${encodeURIComponent(
            paymentId
          )}&select=*`,
          {
            method: "GET",
            headers: supabaseHeaders
          }
        );

      const existingData =
        await existingResponse.json();

      if (
        existingResponse.ok &&
        existingData &&
        existingData.length > 0
      ) {
        const existing =
          existingData[0];

        if (
          Number(existing.request_id) !==
          parsedRequestId
        ) {
          return res.status(409).json({
            error:
              "Payment belongs to another request"
          });
        }

        if (
          String(existing.pi_username || "") !==
          requestOwner
        ) {
          return res.status(409).json({
            error:
              "Payment user does not match request owner"
          });
        }

        const paid =
          await markPaid();

        if (!paid.ok) {
          return res.status(500).json({
            error:
              "Payment was completed, but request status could not be updated"
          });
        }

        return res.status(200).json({
          success: true,
          alreadyCompleted: true,
          message:
            "Payment was already completed",
          transaction: existing,
          request: paid.row
        });
      }

      return res.status(409).json({
        success: false,
        error:
          "Duplicate payment detected"
      });
    }

    // ==========================================
    // OTHER SUPABASE ERROR
    // ==========================================

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

    // ==========================================
    // 6. UPDATE ORDER STATUS
    // ==========================================

    const paid =
      await markPaid();

    if (!paid.ok) {
      return res.status(500).json({
        error:
          "Payment completed and transaction saved, but request status could not be updated",
        transaction:
          supabaseData[0]
      });
    }

    // ==========================================
    // SUCCESS
    // ==========================================

    return res.status(200).json({
      success: true,
      message:
        "Payment completed, transaction saved, and request marked as Paid",
      payment: piData,
      transaction:
        supabaseData[0],
      request:
        paid.row
    });

  } catch (error) {

    console.error(
      "Complete error:",
      error
    );

    return res.status(500).json({
      error:
        "Internal server error"
    });
  }
}
