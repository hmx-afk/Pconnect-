import { isValidPaymentIdentifier, verifyPi } from "../lib/verifyPi.js";

// ==========================================
// PConnect - Secure Pi Payment Approval API
// Testnet | Vercel | Supabase
// Verified Approval | Recovery
// Duplicate Protection | Strict Validation
// ==========================================

const PI_API = "https://api.minepi.com/v2";
const EXPECTED_AMOUNT = 0.01;
const REQUEST_TIMEOUT = 10000;

function send(res, status, data) {
    return res.status(status).json(data);
}

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

        return {
            response,
            data
        };

    } finally {
        clearTimeout(timer);
    }
}

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

async function supabaseRequest(path, options = {}) {
    const { response, data } = await requestJson(
        `${process.env.SUPABASE_URL}/rest/v1/${path}`,
        {
            ...options,
            headers: {
                apikey: process.env.SUPABASE_SECRET_KEY,
                Authorization:
                    `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                ...options.headers
            }
        }
    );

    if (!response.ok) {
        const error = new Error(
            "DATABASE_OPERATION_FAILED"
        );

        error.code = data?.code;

        console.error(
            "PConnect Supabase error:",
            response.status,
            error.code || ""
        );

        throw error;
    }

    return data;
}

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

async function getExistingTransaction(
    paymentId,
    requestId
) {
    const query = new URLSearchParams({
        select: "id,payment_id,request_id",
        or:
            `(payment_id.eq.${paymentId},request_id.eq.${requestId})`,
        limit: "1"
    });

    return await supabaseRequest(
        `transactions?${query.toString()}`
    );
}

function verifyPaymentDetails(payment, user, requestId) {
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

function paymentCancelled(payment) {
    const status = payment.status || {};

    return (
        status.cancelled === true ||
        status.user_cancelled === true
    );
}

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
        // 1. Verify Pi identity through shared helper
        const user = await verifyPi(req);

        if (!user.ok) {
            return send(res, user.status, {
                success: false,
                error: user.error
            });
        }

        // 2. Retrieve authoritative payment from Pi
        let payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

        // 3. Verify payment owner and amount
        if (String(payment.user_uid) !== user.uid) {
            return send(res, 403, {
                success: false,
                error: "Payment owner mismatch."
            });
        }

        if (
            typeof payment.amount !== "number" ||
            payment.amount !== EXPECTED_AMOUNT
        ) {
            return send(res, 400, {
                success: false,
                error: "Invalid payment amount."
            });
        }

        // 4. Verify request ID from Pi metadata
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

        // 5. Verify payment metadata and ownership
        if (!verifyPaymentDetails(
            payment,
            user,
            requestId
        )) {
            return send(res, 403, {
                success: false,
                error: "Payment verification failed."
            });
        }

        if (paymentCancelled(payment)) {
            return send(res, 409, {
                success: false,
                error: "This payment was cancelled."
            });
        }

        // 6. Verify request
        const request = await getRequest(requestId);

        if (!request) {
            return send(res, 404, {
                success: false,
                error: "Request not found."
            });
        }

        // 7. Verify request ownership
        if (
            String(request.pi_username).toLowerCase() !==
            user.username.toLowerCase()
        ) {
            return send(res, 403, {
                success: false,
                error: "Request ownership mismatch."
            });
        }

        if (request.review_status !== "Approved") {
            return send(res, 409, {
                success: false,
                error: "Request has not been approved."
            });
        }

        if (request.order_status !== "Pending") {
            return send(res, 409, {
                success: false,
                error: "Request is not awaiting payment."
            });
        }

        // 8. Prevent payment or request reuse
        const existing = await getExistingTransaction(
            paymentId,
            requestId
        );

        if (existing?.length) {
            return send(res, 409, {
                success: false,
                error: "A transaction already exists for this payment or request."
            });
        }

        const paymentStatus = payment.status || {};

        // 9. Already completed payments need recovery
        // through the completion API, not approval.
        if (
            paymentStatus.developer_completed === true
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment is already completed and requires recovery."
            });
        }

        // 10. Already approved payment
        if (
            paymentStatus.developer_approved === true
        ) {
            return send(res, 200, {
                success: true,
                alreadyApproved: true,
                paymentId
            });
        }

        // 11. Request approval from Pi
        let approvalConfirmed = false;

        try {
            const { response, data } = await requestJson(
                `${PI_API}/payments/${encodeURIComponent(paymentId)}/approve`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Key ${PI_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (response.ok) {
                approvalConfirmed = true;
            }

            if (
                data?.status?.developer_approved === true
            ) {
                approvalConfirmed = true;
            }

        } catch (error) {
            // Approval response may be uncertain.
            // Verify actual state directly from Pi.
            console.error(
                "PConnect approval response uncertain:",
                error.message
            );
        }

        // 12. Always re-fetch payment from Pi
        // before reporting approval success.
        payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

        // 13. Verify final authoritative payment details
        if (!verifyPaymentDetails(
            payment,
            user,
            requestId
        )) {
            return send(res, 409, {
                success: false,
                error: "Final Pi payment verification failed."
            });
        }

        if (paymentCancelled(payment)) {
            return send(res, 409, {
                success: false,
                error: "Payment was cancelled."
            });
        }

        const finalStatus = payment.status || {};

        if (
            finalStatus.developer_completed === true
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment was completed and requires recovery."
            });
        }

        if (
            finalStatus.developer_approved !== true
        ) {
            return send(res, 502, {
                success: false,
                error: approvalConfirmed
                    ? "Pi approval could not be verified."
                    : "Pi payment approval failed."
            });
        }

        // 14. Confirm success only after
        // authoritative Pi verification.
        return send(res, 200, {
            success: true,
            alreadyApproved: false,
            paymentId,
            verified: true
        });

    } catch (error) {
        console.error(
            "PConnect approve API error:",
            error.message
        );

        if (error.name === "AbortError") {
            return send(res, 504, {
                success: false,
                error: "Payment verification timed out."
            });
        }

        if (
            error.message === "PI_PAYMENT_LOOKUP_FAILED"
        ) {
            return send(res, 502, {
                success: false,
                error: "Unable to verify payment with Pi."
            });
        }

        return send(res, 500, {
            success: false,
            error: "Unable to approve payment."
        });
    }
}
