import { isValidPaymentIdentifier, verifyPi } from "../lib/verifyPi.js";

// ==========================================
// PConnect - Secure Pi Payment Status API
// Testnet | Vercel | Supabase
// Payment Verification | Recovery
// Cancellation Verification | Read Only
// ==========================================

const PI_API = "https://api.minepi.com/v2";
const EXPECTED_AMOUNT = 0.01;
const REQUEST_TIMEOUT = 10000;

function send(res, status, data) {
    return res.status(status).json(data);
}

// ==========================================
// FETCH WITH TIMEOUT
// ==========================================

async function requestJson(url, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const data = await response.json().catch(() => null);

        return { response, data };

    } finally {
        clearTimeout(timer);
    }
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

function validSupabaseUrl(value) {

    if (typeof value !== "string" || !value.trim()) {
        return false;
    }

    try {
        const url = new URL(value.trim());

        return (
            url.protocol === "https:" &&
            /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
            !url.port &&
            !url.username &&
            !url.password &&
            url.pathname === "/" &&
            !url.search &&
            !url.hash
        );

    } catch {
        return false;
    }
}


function validTxid(value) {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 200
    );
}

// ==========================================
// GET PI PAYMENT
// ==========================================

async function getPiPayment(paymentId, apiKey) {
    const { response, data } = await requestJson(
        `${PI_API}/payments/${encodeURIComponent(paymentId)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Key ${apiKey}`
            }
        }
    );

    if (!response.ok || !data) {
        throw new Error("PI_PAYMENT_LOOKUP_FAILED");
    }

    return data;
}

// ==========================================
// SUPABASE READ
// ==========================================

async function supabaseRequest(path) {
    const { response, data } = await requestJson(
        `${process.env.SUPABASE_URL}/rest/v1/${path}`,
        {
            method: "GET",
            headers: {
                apikey: process.env.SUPABASE_SECRET_KEY,
                Authorization:
                    `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
                Accept: "application/json"
            }
        }
    );

    if (!response.ok) {
        throw new Error("DATABASE_OPERATION_FAILED");
    }

    return data;
}

// ==========================================
// GET REQUEST
// ==========================================

async function getRequest(requestId) {
    const query = new URLSearchParams({
        select:
            "id,review_status,order_status,pi_username",
        id: `eq.${requestId}`,
        limit: "1"
    });

    const rows = await supabaseRequest(
        `requests?${query.toString()}`
    );

    return rows?.[0] || null;
}

// ==========================================
// GET EXISTING PAYMENT
// ==========================================

async function getExistingPayment(paymentId) {
    const query = new URLSearchParams({
        select:
            "id,payment_id,txid,request_id,amount,currency,pi_username,status",
        payment_id: `eq.${paymentId}`,
        limit: "1"
    });

    const rows = await supabaseRequest(
        `transactions?${query.toString()}`
    );

    return rows?.[0] || null;
}

// ==========================================
// PAYMENT OWNER
// ==========================================

function sameOwner(payment, user, request) {
    return (
        String(payment.user_uid) === user.uid &&
        typeof request.pi_username === "string" &&
        request.pi_username.toLowerCase() ===
            user.username.toLowerCase()
    );
}

// ==========================================
// PAYMENT CANCELLATION
// ==========================================

function paymentCancelled(status) {
    return (
        status.cancelled === true ||
        status.user_cancelled === true
    );
}

// ==========================================
// VERIFY PAYMENT DETAILS
// ==========================================

function verifyPayment(payment, user, requestId) {
    const metadataRequestId = Number(
        payment.metadata?.request_id
    );

    return (
        String(payment.user_uid) === user.uid &&
        typeof payment.amount === "number" &&
        payment.amount === EXPECTED_AMOUNT &&
        Number.isSafeInteger(metadataRequestId) &&
        metadataRequestId === requestId
    );
}

// ==========================================
// VERIFY EXISTING TRANSACTION
// ==========================================

function sameTransaction(
    transaction,
    payment,
    paymentId,
    requestId,
    username
) {
    return (
        !!transaction &&
        transaction.payment_id === paymentId &&
        validTxid(transaction.txid) &&
        transaction.txid === payment.transaction?.txid &&
        Number(transaction.request_id) === requestId &&
        Number(transaction.amount) === EXPECTED_AMOUNT &&
        transaction.currency === "Pi" &&
        typeof transaction.pi_username === "string" &&
        transaction.pi_username.toLowerCase() ===
            username.toLowerCase() &&
        transaction.status === "Completed"
    );
}

// ==========================================
// MAIN API HANDLER
// ==========================================

export default async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {

        res.setHeader("Allow", "POST");

        return send(res, 405, {
            success: false,
            error: "Method not allowed."
        });
    }

    const {
        SUPABASE_URL,
        SUPABASE_SECRET_KEY,
        PI_API_KEY
    } = process.env;

    if (
        !SUPABASE_URL ||
        !SUPABASE_SECRET_KEY ||
        !PI_API_KEY ||
        !validSupabaseUrl(SUPABASE_URL)
    ) {
        return send(res, 500, {
            success: false,
            error: "Server configuration error."
        });
    }

    const paymentId = req.body?.paymentId;

    if (!isValidPaymentIdentifier(paymentId)) {
        return send(res, 400, {
            success: false,
            error: "Invalid payment information."
        });
    }

    try {

        // 1. Verify Pi user with shared helper
        const user = await verifyPi(req);

        if (!user.ok) {
            return send(res, user.status, {
                success: false,
                error: user.error
            });
        }

        // 2. Retrieve payment from Pi
        const payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

        // 3. Verify payment owner
        if (String(payment.user_uid) !== user.uid) {

            return send(res, 403, {
                success: false,
                error: "Payment owner mismatch."
            });
        }

        // 4. Verify amount
        if (
            typeof payment.amount !== "number" ||
            payment.amount !== EXPECTED_AMOUNT
        ) {
            return send(res, 400, {
                success: false,
                error: "Invalid payment amount."
            });
        }

        // 5. Verify request reference
        const requestId = Number(
            payment.metadata?.request_id
        );

        if (
            !Number.isSafeInteger(requestId) ||
            requestId <= 0
        ) {
            return send(res, 400, {
                success: false,
                error: "Invalid request reference."
            });
        }

        if (
            req.body?.request_id !== undefined &&
            Number(req.body.request_id) !== requestId
        ) {
            return send(res, 400, {
                success: false,
                error: "Request reference mismatch."
            });
        }

        // 6. Verify payment details
        if (!verifyPayment(payment, user, requestId)) {

            return send(res, 403, {
                success: false,
                error: "Payment verification failed."
            });
        }

        // 7. Get request
        const request = await getRequest(requestId);

        if (!request) {

            return send(res, 404, {
                success: false,
                error: "Request not found."
            });
        }

        // 8. Verify request owner
        if (!sameOwner(payment, user, request)) {

            return send(res, 403, {
                success: false,
                error: "Request ownership mismatch."
            });
        }

        const status = payment.status || {};

        // 9. Check existing transaction
        const existing = await getExistingPayment(
            paymentId
        );

        if (existing) {

            if (!sameTransaction(
                existing,
                payment,
                paymentId,
                requestId,
                user.username
            )) {

                return send(res, 409, {
                    success: false,
                    state: "conflict",
                    error:
                        "Existing transaction does not match Pi payment."
                });
            }

            return send(res, 200, {
                success: true,
                state: "recorded",
                paymentId,
                txid: existing.txid,
                orderStatus: request.order_status,
                canRetry: false
            });
        }

        // 10. Completed payment
        // Check this BEFORE review_status.
        if (status.developer_completed === true) {

            const txid = payment.transaction?.txid;

            if (!validTxid(txid)) {

                return send(res, 200, {
                    success: true,
                    state: "verification_required",
                    paymentId,
                    canRetry: false
                });
            }

            return send(res, 200, {
                success: true,
                state: "completed",
                paymentId,
                txid,
                canRetry: false
            });
        }

        // 11. Verify request approval
        if (request.review_status !== "Approved") {

            return send(res, 409, {
                success: false,
                state: "conflict",
                error: "Request is not approved.",
                canRetry: false
            });
        }

        // 12. Confirmed cancellation
        if (paymentCancelled(status)) {

            return send(res, 200, {
                success: true,
                state: "cancelled",
                paymentId,
                canRetry:
                    request.order_status === "Pending"
            });
        }

        // 13. Approved but not completed
        if (status.developer_approved === true) {

            return send(res, 200, {
                success: true,
                state: "processing",
                paymentId,
                canRetry: false
            });
        }

        // 14. Payment awaiting approval
        return send(res, 200, {
            success: true,
            state: "pending",
            paymentId,
            canRetry: false
        });

    } catch (error) {

        console.error(
            "PConnect payment status API error:",
            error.message
        );

        if (error.name === "AbortError") {

            return send(res, 504, {
                success: false,
                error:
                    "Payment status verification timed out."
            });
        }


        if (
            error.message === "PI_PAYMENT_LOOKUP_FAILED"
        ) {

            return send(res, 502, {
                success: false,
                error:
                    "Unable to verify payment with Pi."
            });
        }

        return send(res, 500, {
            success: false,
            error:
                "Unable to verify payment status."
        });
    }
}
