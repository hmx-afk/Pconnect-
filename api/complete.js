// ==========================================
// PConnect - Secure Pi Payment Completion API
// Testnet | Vercel | Supabase
// Verified Transaction ID | Idempotent
// Recovery | Duplicate Protection
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

function validSupabaseUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            url.hostname.endsWith(".supabase.co")
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

    if (
        !response.ok ||
        !data?.uid ||
        !data?.username
    ) {
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
                Accept: "application/json",
                ...options.headers
            }
        }
    );

    const data = await readJson(response);

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

async function getExistingByTxid(txid) {
    const query = new URLSearchParams({
        select: "id,payment_id,txid,request_id",
        txid: `eq.${txid}`,
        limit: "1"
    });

    const rows = await supabaseRequest(
        `transactions?${query.toString()}`
    );

    return rows?.[0] || null;
}

async function getRequest(requestId) {
    const query = new URLSearchParams({
        select:
            "id,review_status,order_status,pi_username,service",
        id: `eq.${requestId}`,
        limit: "1"
    });

    const rows = await supabaseRequest(
        `requests?${query.toString()}`
    );

    return rows?.[0] || null;
}

async function markRequestPaid(requestId) {
    const query = new URLSearchParams({
        id: `eq.${requestId}`,
        review_status: "eq.Approved",
        order_status: "eq.Pending"
    });

    const updated = await supabaseRequest(
        `requests?${query.toString()}`,
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

    // Check latest state without overwriting
    // In Progress or Completed orders.
    const latest = await getRequest(requestId);

    return (
        latest?.order_status === "Paid" ||
        latest?.order_status === "In Progress" ||
        latest?.order_status === "Completed"
    );
}

function sameTransaction(
    existing,
    paymentId,
    txid,
    requestId,
    username
) {
    return (
        !!existing &&
        existing.payment_id === paymentId &&
        existing.txid === txid &&
        Number(existing.request_id) === requestId &&
        Number(existing.amount) === EXPECTED_AMOUNT &&
        existing.currency === "Pi" &&
        String(existing.pi_username).toLowerCase() ===
            username.toLowerCase() &&
        existing.status === "Completed"
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

    const authorization =
        req.headers.authorization || "";

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
        accessToken.length < 20 ||
        accessToken.length > 4096 ||
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

        // 3. Verify payment identity and amount
        if (
            String(payment.user_uid) !== user.uid
        ) {
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

        if (
            req.body?.request_id !== undefined &&
            Number(req.body.request_id) !== requestId
        ) {
            return send(res, 400, {
                success: false,
                error: "Request reference mismatch."
            });
        }

        // 5. Verify request
        const request = await getRequest(requestId);

        if (!request) {
            return send(res, 404, {
                success: false,
                error: "Request not found."
            });
        }

        // 6. Verify request ownership
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

        const paymentStatus = payment.status || {};

        if (
            paymentStatus.cancelled === true ||
            paymentStatus.user_cancelled === true
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment was cancelled."
            });
        }

        if (
            paymentStatus.developer_approved !== true
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment has not been approved by the developer."
            });
        }

        // 7. Check existing transaction first.
        // This allows safe retries after an order
        // has moved to In Progress or Completed.
        let existingPayment = await getExistingByPayment(
            paymentId
        );

        if (existingPayment) {
            const verifiedExistingTxid =
                payment.transaction?.txid;

            if (
                paymentStatus.developer_completed !== true ||
                !validTxid(verifiedExistingTxid) ||
                verifiedExistingTxid !== submittedTxid ||
                !sameTransaction(
                    existingPayment,
                    paymentId,
                    verifiedExistingTxid,
                    requestId,
                    user.username
                )
            ) {
                return send(res, 409, {
                    success: false,
                    error: "Existing payment record does not match Pi's confirmed payment."
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

        // 8. New transactions require Pending or Paid
        if (
            request.order_status !== "Pending" &&
            request.order_status !== "Paid"
        ) {
            return send(res, 409, {
                success: false,
                error: "Request is not eligible for payment completion."
            });
        }

        // 9. Complete payment with Pi if necessary
        if (
            paymentStatus.developer_completed !== true
        ) {
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
                // Recover uncertain response by checking Pi again.
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

        // 10. Re-fetch authoritative payment from Pi
        payment = await getPiPayment(
            paymentId,
            PI_API_KEY
        );

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

        const finalStatus = payment.status || {};

        if (
            finalStatus.developer_completed !== true
        ) {
            return send(res, 409, {
                success: false,
                error: "Pi has not confirmed payment completion."
            });
        }

        if (
            finalStatus.cancelled === true ||
            finalStatus.user_cancelled === true
        ) {
            return send(res, 409, {
                success: false,
                error: "Payment was cancelled."
            });
        }

        // 11. Verify final transaction ID
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

        // 12. Prevent transaction ID reuse
        const existingTxid = await getExistingByTxid(
            verifiedTxid
        );

        if (existingTxid) {
            return send(res, 409, {
                success: false,
                error: "This transaction ID is already registered."
            });
        }

        // 13. Save verified transaction
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
                    body: JSON.stringify(
                        transactionRecord
                    )
                }
            );

        } catch (error) {
            // Handle concurrent duplicate insertion.
            if (error.code === "23505") {
                const duplicate = await getExistingByPayment(
                    paymentId
                );

                if (
                    sameTransaction(
                        duplicate,
                        paymentId,
                        verifiedTxid,
                        requestId,
                        user.username
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

        // 14. Mark request as Paid without
        // overwriting In Progress or Completed.
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
            error: "Unable to complete payment."
        });
    }
}
