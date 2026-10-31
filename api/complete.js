// ==========================================
// PConnect - Secure Pi Payment Completion API
// Testnet | Vercel | Supabase
// Verified Transaction ID | Idempotent
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
        const error = new Error("DATABASE_OPERATION_FAILED");
        error.code = data?.code;
        throw error;
    }

    return data;
}

function validTxid(value) {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 200
    );
}

async function getPiPayment(paymentId, apiKey) {
    const response = await fetchWithTimeout(
        `${PI_API}/payments/${encodeURIComponent(paymentId)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Key ${apiKey}`
            }
        }
    );

    const data = await readJson(response);

    if (!response.ok || !data) {
        throw new Error("PI_PAYMENT_LOOKUP_FAILED");
    }

    return data;
}

async function getExistingByPayment(paymentId) {
    const rows = await supabaseRequest(
        `transactions?select=id,payment_id,txid,request_id,amount,currency,pi_username,status&payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`
    );

    return rows?.[0] || null;
}

async function getExistingByTxid(txid) {
    const rows = await supabaseRequest(
        `transactions?select=id,payment_id,txid,request_id&txid=eq.${encodeURIComponent(txid)}&limit=1`
    );

    return rows?.[0] || null;
}

async function getRequest(requestId) {
    const rows = await supabaseRequest(
        `requests?select=id,review_status,order_status,pi_username,service&id=eq.${requestId}&limit=1`
    );

    return rows?.[0] || null;
}

async function markRequestPaid(requestId) {
    const updated = await supabaseRequest(
        `requests?id=eq.${requestId}&review_status=eq.Approved&order_status=eq.Pending`,
        {
            method: "PATCH",
            headers: {
                Prefer: "return=representation"
            },
            body: JSON.stringify({
                order_status: "Paid"
            })
        }
    );

    if (updated?.length) {
        return true;
    }

    const latest = await getRequest(requestId);

    return latest?.order_status === "Paid";
}

function sameTransaction(
    existing,
    paymentId,
    txid,
    requestId
) {
    return (
        existing &&
        existing.payment_id === paymentId &&
        existing.txid === txid &&
        Number(existing.request_id) === requestId
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
        !PI_API_KEY
    ) {
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
    const submittedTxid = req.body?.txid;

    if (
        !accessToken ||
        typeof paymentId !== "string" ||
        paymentId.length < 1 ||
        paymentId.length > 200 ||
        !validTxid(submittedTxid)
    ) {
        return send(res, 400, {
            success: false,
            error: "Invalid payment information."
        });
    }

    try {
        // 1. Verify Pi identity
        const user = await verifyPiToken(accessToken);

        // 2. Retrieve authoritative payment from Pi
        let payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

        if (String(payment.user_uid) !== user.uid) {
            return send(res, 403, {
                success: false,
                error: "Payment owner mismatch."
            });
        }

        // 3. Verify payment amount
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

        if (
            req.body?.request_id !== undefined &&
            Number(req.body.request_id) !== requestId
        ) {
            return send(res, 400, {
                success: false,
                error: "Request reference mismatch."
            });
        }

        // 5. Verify request ownership and approval
        const request = await getRequest(requestId);

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
                error: "Request is not approved."
            });
        }

        // 6. Only Pending or Paid requests are eligible
        if (
            request.order_status !== "Pending" &&
            request.order_status !== "Paid"
        ) {
            return send(res, 409, {
                success: false,
                error: "Request is not eligible for payment completion."
            });
        }

        const paymentStatus = payment.status || {};

        if (
            paymentStatus.cancelled ||
            paymentStatus.user_cancelled
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment was cancelled."
            });
        }

        if (paymentStatus.developer_approved !== true) {
            return send(res, 409, {
                success: false,
                error: "Payment has not been approved by the developer."
            });
        }

        // 7. Complete payment if Pi has not completed it
        if (paymentStatus.developer_completed !== true) {
            const completionResponse = await fetchWithTimeout(
                `${PI_API}/payments/${encodeURIComponent(paymentId)}/complete`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Key ${PI_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        txid: submittedTxid
                    })
                }
            );

            if (!completionResponse.ok) {
                // Re-fetch payment to handle uncertain retries
                payment = await getPiPayment(
                    paymentId,
                    PI_API_KEY
                );

                if (
                    payment.status?.developer_completed !== true
                ) {
                    return send(res, 502, {
                        success: false,
                        error: "Pi payment completion could not be confirmed."
                    });
                }
            }
        }

        // 8. Verify final transaction directly from Pi
        payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

        if (payment.status?.developer_completed !== true) {
            return send(res, 409, {
                success: false,
                error: "Pi has not confirmed payment completion."
            });
        }

        const verifiedTxid = payment.transaction?.txid;

        if (
            !validTxid(verifiedTxid) ||
            verifiedTxid !== submittedTxid
        ) {
            return send(res, 409, {
                success: false,
                error: "Transaction ID does not match Pi's confirmed transaction."
            });
        }

        // 9. Check existing payment transaction
        const existingPayment = await getExistingByPayment(
            paymentId
        );

        if (existingPayment) {
            if (
                !sameTransaction(
                    existingPayment,
                    paymentId,
                    verifiedTxid,
                    requestId
                )
            ) {
                return send(res, 409, {
                    success: false,
                    error: "Existing payment record does not match."
                });
            }

            const paid = await markRequestPaid(requestId);

            if (!paid) {
                return send(res, 409, {
                    success: false,
                    error: "Payment is recorded, but request status needs reconciliation."
                });
            }

            return send(res, 200, {
                success: true,
                alreadyCompleted: true,
                transaction: existingPayment
            });
        }

        // 10. Prevent txid reuse
        const existingTxid = await getExistingByTxid(
            verifiedTxid
        );

        if (existingTxid) {
            return send(res, 409, {
                success: false,
                error: "This transaction ID is already registered."
            });
        }

        // 11. Save verified transaction
        const transactionRecord = {
            payment_id: paymentId,
            txid: verifiedTxid,
            amount: EXPECTED_AMOUNT,
            currency: "Pi",
            pi_username: user.username,
            service: request.service || null,
            status: "Completed",
            request_id: requestId
        };

        let inserted;

        try {
            inserted = await supabaseRequest(
                "transactions",
                {
                    method: "POST",
                    headers: {
                        Prefer: "return=representation"
                    },
                    body: JSON.stringify(transactionRecord)
                }
            );
        } catch (error) {
            if (error.code === "23505") {
                const duplicate = await getExistingByPayment(
                    paymentId
                );

                if (
                    sameTransaction(
                        duplicate,
                        paymentId,
                        verifiedTxid,
                        requestId
                    )
                ) {
                    inserted = [duplicate];
                } else {
                    return send(res, 409, {
                        success: false,
                        error: "Duplicate transaction detected."
                    });
                }
            } else {
                throw error;
            }
        }

        if (!inserted?.length) {
            return send(res, 500, {
                success: false,
                error: "Transaction could not be saved."
            });
        }

        // 12. Update request without overwriting later states
        const paid = await markRequestPaid(requestId);

        if (!paid) {
            return send(res, 409, {
                success: false,
                error: "Transaction saved, but request status needs reconciliation."
            });
        }

        return send(res, 200, {
            success: true,
            alreadyCompleted: false,
            transaction: inserted[0],
            request: {
                id: requestId,
                order_status: "Paid"
            }
        });

    } catch (error) {
        console.error(
            "PConnect complete API error:",
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

        if (error.message === "PI_PAYMENT_LOOKUP_FAILED") {
            return send(res, 502, {
                success: false,
                error: "Unable to verify payment with Pi."
            });
        }

        return send(res, 500, {
            success: false,
            error: "Unable to complete payment."
        });
    }
}
