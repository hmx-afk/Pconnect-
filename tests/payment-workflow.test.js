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

function createPayment(status = {}) {
    return {
        identifier: PAYMENT_ID,
        user_uid: UID,
        amount: 0.01,
        metadata: { request_id: REQUEST_ID },
        status: {
            developer_approved: false,
            developer_completed: false,
            ...status
        },
        transaction: null
    };
}

function createRequest() {
    return {
        id: REQUEST_ID,
        review_status: "Approved",
        order_status: "Pending",
        pi_username: USERNAME,
        service: "Web Development"
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

function createApprovalMock() {
    let payment = createPayment();
    const request = createRequest();

    const calls = {
        identity: 0,
        paymentLookup: 0,
        approval: 0,
        requestLookup: 0,
        transactionLookup: 0
    };

    return {
        calls,

        fetch: async (url, options = {}) => {
            const parsed = new URL(url);
            const method = options.method || "GET";

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
                return response({ success: true });
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests")
            ) {
                calls.requestLookup++;
                return response([request]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions")
            ) {
                calls.transactionLookup++;
                return response([]);
            }

            throw new Error(`Unexpected request: ${method} ${url}`);
        }
    };
}

function createCompletionMock() {
    const payment = createPayment({
        developer_approved: true
    });

    const request = createRequest();

    const calls = {
        identity: 0,
        paymentLookup: 0,
        completion: 0,
        requestLookup: 0,
        transactionLookup: 0,
        transactionInsert: 0,
        requestUpdate: 0
    };

    return {
        calls,

        fetch: async (url, options = {}) => {
            const parsed = new URL(url);
            const method = options.method || "GET";

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

                const submitted = JSON.parse(options.body);
                assert.equal(submitted.txid, TXID);

                payment.status.developer_completed = true;
                payment.transaction = { txid: TXID };

                return response({ success: true });
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests") &&
                method === "GET"
            ) {
                calls.requestLookup++;
                return response([request]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/requests") &&
                method === "PATCH"
            ) {
                calls.requestUpdate++;
                request.order_status = "Paid";
                return response([request]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions") &&
                method === "GET"
            ) {
                calls.transactionLookup++;
                return response([]);
            }

            if (
                parsed.pathname.endsWith("/rest/v1/transactions") &&
                method === "POST"
            ) {
                calls.transactionInsert++;
                const inserted = JSON.parse(options.body);

                return response([{
                    id: 501,
                    ...inserted
                }]);
            }

            throw new Error(`Unexpected request: ${method} ${url}`);
        }
    };
}

test(
    "Approve API completes verified Pi approval",
    async () => {
        const mock = createApprovalMock();

        const result = await invoke(
            approveHandler,
            { paymentId: PAYMENT_ID },
            mock.fetch
        );

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.verified, true);
        assert.equal(result.body.paymentId, PAYMENT_ID);

        assert.equal(mock.calls.identity, 1);
        assert.equal(mock.calls.approval, 1);
        assert.equal(mock.calls.paymentLookup, 2);
    }
);

test(
    "Complete API saves a Pi-verified transaction",
    async () => {
        const mock = createCompletionMock();

        const result = await invoke(
            completeHandler,
            {
                paymentId: PAYMENT_ID,
                txid: TXID
            },
            mock.fetch
        );

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.alreadyCompleted, false);

        assert.equal(
            result.body.transaction.payment_id,
            PAYMENT_ID
        );

        assert.equal(
            result.body.transaction.txid,
            TXID
        );

        assert.equal(
            result.body.request.order_status,
            "Paid"
        );

        assert.equal(mock.calls.identity, 1);
        assert.equal(mock.calls.completion, 1);
        assert.equal(mock.calls.transactionInsert, 1);
        assert.equal(mock.calls.requestUpdate, 1);
        assert.equal(mock.calls.paymentLookup, 2);
    }
);

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
