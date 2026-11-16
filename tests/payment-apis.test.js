import test from "node:test";
import assert from "node:assert/strict";

import approveHandler from "../api/approve.js";
import completeHandler from "../api/complete.js";
import paymentStatusHandler from "../api/payment-status.js";

const originalFetch = globalThis.fetch;

const envKeys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "PI_API_KEY"
];

const originalEnv = Object.fromEntries(
    envKeys.map(key => [key, process.env[key]])
);

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,

        setHeader(name, value) {
            this.headers[name] = value;
        },

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(data) {
            this.body = data;
            return this;
        },

        end(data) {
            this.body = data;
            return this;
        }
    };
}

function setTestEnvironment() {
    process.env.SUPABASE_URL =
        "https://capjfdyyeaxvekqzsbbi.supabase.co";

    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    process.env.PI_API_KEY = "test-pi-api-key";
}

async function invoke(handler, body) {
    let fetchCalls = 0;

    setTestEnvironment();

    globalThis.fetch = async () => {
        fetchCalls++;
        throw new Error("Unexpected external request");
    };

    const req = {
        method: "POST",
        headers: {},
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
        body: res.body,
        fetchCalls
    };
}

function mockFetchResponse(data) {
    return {
        ok: true,
        status: 200,

        async json() {
            return data;
        }
    };
}

async function invokePaymentStatus(payment) {
    let fetchCalls = 0;

    setTestEnvironment();

    const user = {
        uid: "test-pi-uid",
        username: "testuser"
    };

    const request = {
        id: 1,
        review_status: "Approved",
        order_status: "Pending",
        pi_username: "testuser"
    };

    globalThis.fetch = async url => {
        fetchCalls++;

        const target = String(url);

        if (target === "https://api.minepi.com/v2/me") {
            return mockFetchResponse(user);
        }

        if (
            target ===
            "https://api.minepi.com/v2/payments/valid-payment-123"
        ) {
            return mockFetchResponse(payment);
        }

        if (
            target.includes("/rest/v1/requests?")
        ) {
            return mockFetchResponse([request]);
        }

        if (
            target.includes("/rest/v1/transactions?")
        ) {
            return mockFetchResponse([]);
        }

        throw new Error("Unexpected mocked URL");
    };

    const req = {
        method: "POST",
        headers: {
            authorization: "Bearer test-pi-access-token-123456"
        },
        body: {
            paymentId: "valid-payment-123"
        }
    };

    const res = createResponse();

    try {
        await paymentStatusHandler(req, res);
    } finally {
        globalThis.fetch = originalFetch;
    }

    return {
        statusCode: res.statusCode,
        body: res.body,
        fetchCalls
    };
}

function createTestPayment(status, txid = "valid-test-txid") {
    return {
        user_uid: "test-pi-uid",
        amount: 0.01,

        metadata: {
            request_id: 1
        },

        status,

        transaction: {
            txid
        }
    };
}

// ==========================================
// EXISTING VALIDATION TESTS
// ==========================================

test(
    "Approve API rejects unsafe payment ID before external calls",
    async () => {
        const result = await invoke(
            approveHandler,
            {
                paymentId: "payment/id"
            }
        );

        assert.equal(result.statusCode, 400);
        assert.equal(result.fetchCalls, 0);
    }
);

test(
    "Complete API rejects unsafe payment ID before external calls",
    async () => {
        const result = await invoke(
            completeHandler,
            {
                paymentId: "payment,id",
                txid: "valid-test-txid"
            }
        );

        assert.equal(result.statusCode, 400);
        assert.equal(result.fetchCalls, 0);
    }
);

test(
    "Complete API rejects missing TXID before external calls",
    async () => {
        const result = await invoke(
            completeHandler,
            {
                paymentId: "valid-payment-123"
            }
        );

        assert.equal(result.statusCode, 400);
        assert.equal(result.fetchCalls, 0);
    }
);

test(
    "Payment status API rejects unsafe payment ID before external calls",
    async () => {
        const result = await invoke(
            paymentStatusHandler,
            {
                paymentId: "payment(id)"
            }
        );

        assert.equal(result.statusCode, 400);
        assert.equal(result.fetchCalls, 0);
    }
);

// ==========================================
// PAYMENT STATUS REGRESSION TESTS
// ==========================================

test(
    "Payment status reports confirmed cancellation as cancelled",
    async () => {
        const payment = createTestPayment({
            cancelled: true
        });

        const result = await invokePaymentStatus(payment);

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.state, "cancelled");
        assert.equal(result.body.canRetry, true);
    }
);

test(
    "Payment status requires verification when completed lacks approval",
    async () => {
        const payment = createTestPayment({
            developer_completed: true,
            developer_approved: false
        });

        const result = await invokePaymentStatus(payment);

        assert.equal(result.statusCode, 200);
        assert.equal(
            result.body.state,
            "verification_required"
        );
        assert.equal(result.body.canRetry, false);
    }
);

test(
    "Payment status reports completed only after both Pi confirmations",
    async () => {
        const payment = createTestPayment({
            developer_approved: true,
            developer_completed: true
        });

        const result = await invokePaymentStatus(payment);

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.state, "completed");
        assert.equal(result.body.txid, "valid-test-txid");
        assert.equal(result.body.canRetry, false);
    }
);

test(
    "Payment status requires verification for conflicting cancellation and completion flags",
    async () => {
        const payment = createTestPayment({
            cancelled: true,
            developer_approved: true,
            developer_completed: true
        });

        const result = await invokePaymentStatus(payment);

        assert.equal(result.statusCode, 200);
        assert.equal(
            result.body.state,
            "verification_required"
        );
        assert.equal(result.body.canRetry, false);
    }
);

// ==========================================
// RESTORE ORIGINAL ENVIRONMENT
// ==========================================

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
