import test from "node:test";
import assert from "node:assert/strict";

import approveHandler from "../api/approve.js";
import completeHandler from "../api/complete.js";

const originalFetch = globalThis.fetch;

const envKeys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "PI_API_KEY"
];

const originalEnv = Object.fromEntries(
    envKeys.map(key => [key, process.env[key]])
);

const TOKEN = "abcdefghijklmnopqrstuvwxyz123456";
const PAYMENT_ID = "payment-test-123";
const TXID = "verified-test-txid";
const REQUEST_ID = 123;
const USERNAME = "testuser";
const UID = "test-user-123";

function response(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        setHeader() {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

function setEnvironment() {
    process.env.SUPABASE_URL =
        "https://capjfdyyeaxvekqzsbbi.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    process.env.PI_API_KEY = "test-pi-api-key";
}

function createPayment(overrides = {}) {
    return {
        identifier: PAYMENT_ID,
        user_uid: UID,
        amount: 0.01,
        metadata: { request_id: REQUEST_ID },
        direction: "user_to_app",
        network: "Pi Testnet",
        to_address: "GB4XAB2DCULHBLUCWUANE57XWKDFOUYS5HJC2TH4SLEN7XKQ2UUPWVXU",
        ...overrides,
        status: {
            developer_approved: false,
            developer_completed: false,
            transaction_verified: true,
            ...overrides.status
        },
        transaction: overrides.transaction ?? null
    };
}
function createRequest(overrides = {}) {
    return {
        id: REQUEST_ID,
        review_status: "Approved",
        order_status: "Pending",
        pi_username: USERNAME,
        service: "Web Development",
        ...overrides
    };
}

function createTransaction(overrides = {}) {
    return {
        id: 501,
        payment_id: PAYMENT_ID,
        txid: TXID,
        request_id: REQUEST_ID,
        amount: 0.01,
        currency: "Pi",
        pi_username: USERNAME,
        status: "Completed",
        ...overrides
    };
}

async function invoke(handler, body, fetchMock) {
    setEnvironment();
    globalThis.fetch = fetchMock;

    const req = {
        method: "POST",
        headers: {
            authorization: `Bearer ${TOKEN}`
        },
        body
    };

    const res = createResponse();

    try {
        await handler(req, res);
    } finally {
        globalThis.fetch = originalFetch;
    }

    return {
        statusCode: res.statusCode,
        body: res.body
    };
}

function createApprovalMock(options = {}) {
    const payment = createPayment(options.payment || {});
    const request = createRequest(options.request || {});
    const existing = options.existing || [];

    const calls = {
        identity: 0,
        paymentLookup: 0,
        approval: 0,
        requestLookup: 0,
        transactionLookup: 0
    };

    return {
        calls,

        fetch: async (url, requestOptions = {}) => {
            const parsed = new URL(url);
            const method = requestOptions.method || "GET";

            if (parsed.pathname.endsWith("/v2/me")) {
                calls.identity++;
                return response({
                    uid: UID,
                    username: USERNAME
                });
            }

            if (
                parsed.pathname.endsWith(
                    `/v2/payments/${PAYMENT_ID}`
                )
            ) {
                calls.paymentLookup++;
                return response(payment);
            }

            if (
                parsed.pathname.endsWith(
                    `/v2/payments/${PAYMENT_ID}/approve`
                ) && method === "POST"
            ) {
                calls.approval++;
                payment.status.developer_approved = true;

                if (options.afterApprovalPayment) {
                    const finalOverrides = options.afterApprovalPayment;

                    Object.assign(payment, finalOverrides);

                    if (finalOverrides.status) {
                        payment.status = {
                            ...payment.status,
                            ...finalOverrides.status
                        };
                    }
                }

                return response({ success: true });
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests")
            ) {
                calls.requestLookup++;
                return response(request ? [request] : []);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions")
            ) {
                calls.transactionLookup++;
                return response(existing);
            }

            throw new Error(`Unexpected request: ${method} ${url}`);
        }
    };
}

function createCompletionMock(options = {}) {
    const payment = createPayment({
        ...(options.payment || {}),
        status: {
            developer_approved: true,
            developer_completed: false,
            transaction_verified: true,
            ...(options.payment?.status || {})
        }
    });

    const request = createRequest(
        options.request || {}
    );

    const existingPayment = options.existingPayment || null;
    const existingTxid = options.existingTxid || null;
    const existingRequest = options.existingRequest || null;

    const finalTxid = options.finalTxid || TXID;

    const calls = {
        identity: 0,
        paymentLookup: 0,
        completion: 0,
        requestLookup: 0,
        requestUpdate: 0,
        requestUpdateFilters: null,
        transactionLookup: 0,
        transactionInsert: 0
    };

    return {
        calls,

        fetch: async (url, requestOptions = {}) => {
            const parsed = new URL(url);
            const method = requestOptions.method || "GET";

            if (parsed.pathname.endsWith("/v2/me")) {
                calls.identity++;
                return response({
                    uid: UID,
                    username: USERNAME
                });
            }

            if (
                parsed.pathname.endsWith(
                    `/v2/payments/${PAYMENT_ID}`
                )
            ) {
                calls.paymentLookup++;
                return response(payment);
            }

            if (
                parsed.pathname.endsWith(
                    `/v2/payments/${PAYMENT_ID}/complete`
                ) && method === "POST"
            ) {
                calls.completion++;

                payment.status.developer_completed = true;
                payment.transaction = {
                    txid: finalTxid,
                    verified: options.payment?.transaction?.verified ?? true
                };

                if (options.afterCompletionPayment) {
                    Object.assign(payment, options.afterCompletionPayment);
                }

                return response({ success: true });
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests") &&
                method === "GET"
            ) {
                calls.requestLookup++;
                return response(request ? [request] : []);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests") &&
                method === "PATCH"
            ) {
                calls.requestUpdate++;

                calls.requestUpdateFilters = {
                    id: parsed.searchParams.get("id"),
                    review_status: parsed.searchParams.get("review_status"),
                    order_status: parsed.searchParams.get("order_status")
                };

                const validUpdate =
                    calls.requestUpdateFilters.id === `eq.${REQUEST_ID}` &&
                    calls.requestUpdateFilters.review_status === "eq.Approved" &&
                    calls.requestUpdateFilters.order_status === "eq.Pending" &&
                    request?.id === REQUEST_ID &&
                    request?.review_status === "Approved" &&
                    request?.order_status === "Pending";

                if (validUpdate) {
                    request.order_status = "Paid";
                    return response([request]);
                }

                return response([]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions") &&
                method === "GET"
            ) {
                calls.transactionLookup++;

                const paymentId = parsed.searchParams.get("payment_id");
                const txid = parsed.searchParams.get("txid");
                const requestId = parsed.searchParams.get("request_id");

                if (paymentId) {
                    return response(existingPayment ? [existingPayment] : []);
                }

                if (txid) {
                    return response(existingTxid ? [existingTxid] : []);
                }

                if (requestId) {
                    return response(existingRequest ? [existingRequest] : []);
                }

                return response([]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions") &&
                method === "POST"
            ) {
                calls.transactionInsert++;

                const inserted = JSON.parse(requestOptions.body);

                return response([{
                    id: 502,
                    ...inserted
                }]);
            }

            throw new Error(`Unexpected request: ${method} ${url}`);
        }
    };
}

// ==========================================
// APPROVAL SECURITY TESTS
// ==========================================

test("Approve rejects payment owned by another Pi user", async () => {
    const mock = createApprovalMock({
        payment: { user_uid: "another-user-uid" }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 403);
    assert.equal(result.body.success, false);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects incorrect payment amount", async () => {
    const mock = createApprovalMock({
        payment: { amount: 0.02 }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 400);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects an incorrect payment recipient", async () => {
    const mock = createApprovalMock({
        payment: { to_address: "WRONG_APP_WALLET" }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.success, false);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects a payment on the wrong network", async () => {
    const mock = createApprovalMock({
        payment: { network: "Pi Mainnet" }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.success, false);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects an app-to-user payment", async () => {
    const mock = createApprovalMock({
        payment: { direction: "app_to_user" }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.success, false);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects a payment route changed after Pi approval", async () => {
    const mock = createApprovalMock({
        afterApprovalPayment: {
            to_address: "CHANGED_APP_WALLET"
        }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.success, false);
    assert.equal(mock.calls.approval, 1);
    assert.equal(mock.calls.paymentLookup, 2);
});

test("Approve rejects cancelled payment", async () => {
    const mock = createApprovalMock({
        payment: {
            status: { cancelled: true }
        }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects when final Pi lookup does not confirm approval", async () => {
    const mock = createApprovalMock({
        afterApprovalPayment: {
            status: {
                developer_approved: false
            }
        }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 502);
    assert.equal(result.body.success, false);
    assert.equal(
        result.body.error,
        "Pi approval could not be verified."
    );
    assert.equal(mock.calls.approval, 1);
    assert.equal(mock.calls.paymentLookup, 2);
});

test("Approve rejects request ownership mismatch", async () => {
    const mock = createApprovalMock({
        request: { pi_username: "differentuser" }
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 403);
    assert.equal(mock.calls.approval, 0);
});

test("Approve rejects an existing transaction", async () => {
    const mock = createApprovalMock({
        existing: [{ id: 501, payment_id: PAYMENT_ID }]
    });

    const result = await invoke(
        approveHandler,
        { paymentId: PAYMENT_ID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.approval, 0);
});

// ==========================================
// COMPLETION SECURITY TESTS
// ==========================================

test("Complete rejects payment owned by another Pi user", async () => {
    const mock = createCompletionMock({
        payment: { user_uid: "another-user-uid" }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 403);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects incorrect payment amount", async () => {
    const mock = createCompletionMock({
        payment: { amount: 0.02 }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 400);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects cancelled payment", async () => {
    const mock = createCompletionMock({
        payment: {
            status: {
                developer_approved: true,
                cancelled: true
            }
        }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects request ownership mismatch", async () => {
    const mock = createCompletionMock({
        request: { pi_username: "differentuser" }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 403);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects request reference mismatch", async () => {
    const mock = createCompletionMock();

    const result = await invoke(
        completeHandler,
        {
            paymentId: PAYMENT_ID,
            txid: TXID,
            request_id: 999
        },
        mock.fetch
    );

    assert.equal(result.statusCode, 400);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects payment not approved by developer", async () => {
    const mock = createCompletionMock({
        payment: {
            status: {
                developer_approved: false,
                developer_completed: false
            }
        }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects TXID that differs from Pi confirmation", async () => {
    const mock = createCompletionMock({
        finalTxid: "different-confirmed-txid"
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
});

// ==========================================
// DUPLICATE AND RECOVERY TESTS
// ==========================================

test("Complete accepts a correctly verified Pi Testnet payment", async () => {
    const mock = createCompletionMock();

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(mock.calls.transactionInsert, 1);
});

test("Complete rejects an incorrect payment recipient", async () => {
    const mock = createCompletionMock({
        payment: { to_address: "WRONG_RECIPIENT_ADDRESS" }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects a payment on the wrong network", async () => {
    const mock = createCompletionMock({
        payment: { network: "Pi Network" }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects an app-to-user payment", async () => {
    const mock = createCompletionMock({
        payment: { direction: "app_to_user" }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects an unverified blockchain transaction", async () => {
    const mock = createCompletionMock({
        payment: {
            status: { transaction_verified: false },
            transaction: { verified: false }
        }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.completion, 1);
    assert.equal(mock.calls.requestUpdate, 0);
    assert.equal(mock.calls.transactionInsert, 0);
});

test("Complete rejects a recipient changed after Pi completion", async () => {
    const mock = createCompletionMock({
        afterCompletionPayment: {
            to_address: "GWRONGTESTWALLETADDRESS"
        }
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.completion, 1);
    assert.equal(mock.calls.paymentLookup, 2);
    assert.equal(mock.calls.requestUpdate, 0);
    assert.equal(mock.calls.transactionInsert, 0);
});

test("Complete rejects an existing conflicting payment record", async () => {
    const mock = createCompletionMock({
        existingPayment: createTransaction({
            txid: "different-txid"
        })
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
});

test("Complete recovers an identical existing transaction", async () => {
    const existing = createTransaction();

    const mock = createCompletionMock({
        payment: {
            status: {
                developer_approved: true,
                developer_completed: true
            },
            transaction: { txid: TXID, verified: true }
        },
        request: { order_status: "In Progress" },
        existingPayment: existing
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.alreadyCompleted, true);
    assert.equal(result.body.request.order_status, "In Progress");

    assert.equal(mock.calls.completion, 0);
    assert.equal(mock.calls.transactionInsert, 0);
});

test("Complete recovers an existing transaction and marks a Pending request as Paid", async () => {
    const existing = createTransaction();

    const mock = createCompletionMock({
        payment: {
            status: {
                developer_approved: true,
                developer_completed: true
            },
            transaction: {
                txid: TXID,
                verified: true
            }
        },
        request: {
            order_status: "Pending"
        },
        existingPayment: existing
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.alreadyCompleted, true);
    assert.equal(result.body.request.order_status, "Paid");
    assert.equal(mock.calls.requestUpdate, 1);
    assert.equal(mock.calls.transactionInsert, 0);
    assert.equal(mock.calls.completion, 0);
});

test("Complete does not downgrade an existing Completed request", async () => {
    const existing = createTransaction();

    const mock = createCompletionMock({
        payment: {
            status: {
                developer_approved: true,
                developer_completed: true
            },
            transaction: {
                txid: TXID,
                verified: true
            }
        },
        request: {
            order_status: "Completed"
        },
        existingPayment: existing
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.alreadyCompleted, true);
    assert.equal(result.body.request.order_status, "Completed");

    assert.equal(mock.calls.requestUpdate, 1);
    assert.equal(mock.calls.transactionInsert, 0);
    assert.equal(mock.calls.completion, 0);
});

test("Complete rejects a TXID already registered to another transaction", async () => {
    const mock = createCompletionMock({
        existingTxid: createTransaction({
            id: 900,
            payment_id: "another-payment",
            request_id: 999,
            txid: TXID
        })
    });

    const result = await invoke(
        completeHandler,
        { paymentId: PAYMENT_ID, txid: TXID },
        mock.fetch
    );

    assert.equal(result.statusCode, 409);
    assert.equal(mock.calls.transactionInsert, 0);
});

test.after(() => {
    globalThis.fetch = originalFetch;

    for (const key of envKeys) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
});
