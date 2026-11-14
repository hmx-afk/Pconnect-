import test from "node:test";
import assert from "node:assert/strict";

import adminRequestsHandler from "../api/admin-requests.js";
import adminReviewHandler from "../api/admin-review.js";

const originalFetch = globalThis.fetch;

const envKeys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "ADMIN_REVIEW_KEY"
];

const originalEnv = Object.fromEntries(
    envKeys.map(key => [key, process.env[key]])
);

let fetchCalls = 0;

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

async function invoke(handler, method, headers = {}, body = undefined, adminKey = "test-admin-secret") {
    process.env.SUPABASE_URL =
        "https://capjfdyyeaxvekqzsbbi.supabase.co";

    process.env.SUPABASE_SECRET_KEY = "test-secret-key";

    if (adminKey === null) {
        delete process.env.ADMIN_REVIEW_KEY;
    } else {
        process.env.ADMIN_REVIEW_KEY = adminKey;
    }

    fetchCalls = 0;

    globalThis.fetch = async () => {
        fetchCalls++;
        throw new Error("Unexpected external request");
    };

    const req = {
        method,
        headers,
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

/* ADMIN REQUESTS */

test("Admin requests rejects missing key", async () => {
    const result = await invoke(
        adminRequestsHandler,
        "GET"
    );

    assert.equal(result.statusCode, 401);
    assert.equal(result.fetchCalls, 0);
});

test("Admin requests rejects incorrect key", async () => {
    const result = await invoke(
        adminRequestsHandler,
        "GET",
        { "x-admin-key": "wrong-key" }
    );

    assert.equal(result.statusCode, 401);
    assert.equal(result.fetchCalls, 0);
});

test("Admin requests rejects non-GET method", async () => {
    const result = await invoke(
        adminRequestsHandler,
        "POST",
        { "x-admin-key": "test-admin-secret" }
    );

    assert.equal(result.statusCode, 405);
    assert.equal(result.fetchCalls, 0);
});

/* ADMIN REVIEW */

test("Admin review rejects missing key", async () => {
    const result = await invoke(
        adminReviewHandler,
        "POST",
        {},
        { id: 1, action: "approve" }
    );

    assert.equal(result.statusCode, 401);
    assert.equal(result.fetchCalls, 0);
});

test("Admin review rejects incorrect key", async () => {
    const result = await invoke(
        adminReviewHandler,
        "POST",
        { "x-admin-key": "wrong-key" },
        { id: 1, action: "approve" }
    );

    assert.equal(result.statusCode, 401);
    assert.equal(result.fetchCalls, 0);
});

test("Admin review rejects non-POST method", async () => {
    const result = await invoke(
        adminReviewHandler,
        "GET",
        { "x-admin-key": "test-admin-secret" }
    );

    assert.equal(result.statusCode, 405);
    assert.equal(result.fetchCalls, 0);
});

test("Admin requests rejects missing server admin configuration", async () => {
    const result = await invoke(
        adminRequestsHandler,
        "GET",
        {},
        undefined,
        null
    );

    assert.equal(result.statusCode, 500);
    assert.equal(result.fetchCalls, 0);
});

test("Admin review rejects missing server admin configuration", async () => {
    const result = await invoke(
        adminReviewHandler,
        "POST",
        {},
        { id: 1, action: "approve" },
        null
    );

    assert.equal(result.statusCode, 500);
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
