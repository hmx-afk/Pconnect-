// ==========================================
// PConnect - Secure Pi Payment Approval API
// Testnet | Vercel | Supabase
// ==========================================

const PI_API = "https://api.minepi.com/v2";
const EXPECTED_AMOUNT = 0.01;
const REQUEST_TIMEOUT = 10000;

function send(res, status, data) {
    return res.status(status).json(data);
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function verifyPiToken(accessToken) {
    const response = await fetchWithTimeout(
        `${PI_API}/me`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    const data = await readJson(response);

    if (!response.ok || !data?.uid || !data?.username) {
        throw new Error("PI_AUTH_FAILED");
    }

    return {
        uid: String(data.uid),
        username: String(data.username)
    };
}

async function supabaseRequest(path, options = {}) {
    const response = await fetchWithTimeout(
        `${process.env.SUPABASE_URL}/rest/v1/${path}`,
        {
            ...options,
            headers: {
                apikey: process.env.SUPABASE_SECRET_KEY,
                Authorization:
                    `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
                "Content-Type": "application/json",
                ...options.headers
            }
        }
    );

    const data = await readJson(response);

    if (!response.ok) {
        throw new Error("DATABASE_OPERATION_FAILED");
    }

    return data;
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

    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !PI_API_KEY) {
        return send(res, 500, {
            success: false,
            error: "Server configuration error."
        });
    }

    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return send(res, 401, {
            success: false,
            error: "Authentication required."
        });
    }

    const accessToken = authorization.slice(7).trim();
    const paymentId = req.body?.paymentId;

    if (
        !accessToken ||
        typeof paymentId !== "string" ||
        paymentId.length < 1 ||
        paymentId.length > 200
    ) {
        return send(res, 400, {
            success: false,
            error: "Invalid payment information."
        });
    }

    try {
        // 1. Verify Pi identity
        const user = await verifyPiToken(accessToken);

        // 2. Retrieve payment from Pi
        const paymentResponse = await fetchWithTimeout(
            `${PI_API}/payments/${encodeURIComponent(paymentId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Key ${PI_API_KEY}`
                }
            }
        );

        const payment = await readJson(paymentResponse);

        if (!paymentResponse.ok || !payment) {
            return send(res, 400, {
                success: false,
                error: "Unable to verify Pi payment."
            });
        }

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

        // 5. Verify request ID from Pi metadata
        const requestId = Number(payment.metadata?.request_id);

        if (
            !Number.isSafeInteger(requestId) ||
            requestId <= 0
        ) {
            return send(res, 400, {
                success: false,
                error: "Invalid request reference."
            });
        }

        // 6. Check payment status
        const paymentStatus = payment.status || {};

        if (
            paymentStatus.cancelled ||
            paymentStatus.user_cancelled
        ) {
            return send(res, 409, {
                success: false,
                error: "This payment was cancelled."
            });
        }

        // 7. Verify request ownership and state
        const requests = await supabaseRequest(
            `requests?select=id,review_status,order_status,pi_username&id=eq.${requestId}&limit=1`
        );

        const request = requests?.[0];

        if (!request) {
            return send(res, 404, {
                success: false,
                error: "Request not found."
            });
        }

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

        // 8. Prevent payment reuse
        const existing = await supabaseRequest(
            `transactions?select=id,payment_id,request_id&or=(payment_id.eq.${encodeURIComponent(paymentId)},request_id.eq.${requestId})&limit=1`
        );

        if (existing?.length) {
            return send(res, 409, {
                success: false,
                error: "A transaction already exists for this payment or request."
            });
        }

        // 9. Idempotent approval
        if (paymentStatus.developer_approved === true) {
            return send(res, 200, {
                success: true,
                alreadyApproved: true,
                paymentId
            });
        }

        if (paymentStatus.developer_completed === true) {
            return send(res, 409, {
                success: false,
                error: "Payment is already completed and requires reconciliation."
            });
        }

        // 10. Approve payment with Pi
        const approvalResponse = await fetchWithTimeout(
            `${PI_API}/payments/${encodeURIComponent(paymentId)}/approve`,
            {
                method: "POST",
                headers: {
                    Authorization: `Key ${PI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const approvalData = await readJson(approvalResponse);

        if (!approvalResponse.ok) {
            return send(res, 502, {
                success: false,
                error: "Pi payment approval failed."
            });
        }

        if (
            approvalData?.status?.developer_approved === false
        ) {
            return send(res, 502, {
                success: false,
                error: "Pi did not confirm payment approval."
            });
        }

        return send(res, 200, {
            success: true,
            alreadyApproved: false,
            paymentId
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

        if (error.message === "PI_AUTH_FAILED") {
            return send(res, 401, {
                success: false,
                error: "Pi authentication failed."
            });
        }

        return send(res, 500, {
            success: false,
            error: "Unable to approve payment."
        });
    }
}
