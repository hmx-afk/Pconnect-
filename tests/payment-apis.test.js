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

async function invoke(handler, body) {
    let fetchCalls = 0;

    process.env.SUPABASE_URL =
        "https://capjfdyyeaxvekqzsbbi.supabase.co";

    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    process.env.PI_API_KEY = "test-pi-api-key";

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

test("Approve API rejects unsafe payment ID before external calls", async () => {
    const result = await invoke(approveHandler, {
        paymentId: "payment/id"
    });

    assert.equal(result.statusCode, 400);
    assert.equal(result.fetchCalls, 0);
});

test("Complete API rejects unsafe payment ID before external calls", async () => {
    const result = await invoke(completeHandler, {
        paymentId: "payment,id",
        txid: "valid-test-txid"
    });

    assert.equal(result.statusCode, 400);
    assert.equal(result.fetchCalls, 0);
});

test("Complete API rejects missing TXID before external calls", async () => {
    const result = await invoke(completeHandler, {
        paymentId: "valid-payment-123"
    });

    assert.equal(result.statusCode, 400);
    assert.equal(result.fetchCalls, 0);
});

test("Payment status API rejects unsafe payment ID before external calls", async () => {
    const result = await invoke(paymentStatusHandler, {
        paymentId: "payment(id)"
    });

    assert.equal(result.statusCode, 400);
    assert.equal(result.fetchCalls, 0);
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
