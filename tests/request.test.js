import test from "node:test";
import assert from "node:assert/strict";

import handler from "../api/request.js";

const VALID_TOKEN = "abcdefghijklmnopqrstuvwxyz123456";
const SUPABASE_URL = "https://capjfdyyeaxvekqzsbbi.supabase.co";
const SUPABASE_KEY = "test-supabase-secret-key";

const validBody = {
    service: "Web Development",
    name: "Test User",
    contact: "test@example.com",
    details: "I need a website for my business.",
    accessToken: VALID_TOKEN,
    pi_username: "attacker_username"
};

function response(status, data) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

async function invoke({
    method = "POST",
    body = validBody,
    fetchImpl = async () => {
        throw new Error("Unexpected fetch call");
    },
    supabaseUrl = SUPABASE_URL,
    supabaseKey = SUPABASE_KEY
} = {}) {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SECRET_KEY;

    const res = {
        statusCode: null,
        data: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.data = data;
            return this;
        }
    };

    try {
        globalThis.fetch = fetchImpl;

        if (supabaseUrl === null) {
            delete process.env.SUPABASE_URL;
        } else {
            process.env.SUPABASE_URL = supabaseUrl;
        }

        if (supabaseKey === null) {
            delete process.env.SUPABASE_SECRET_KEY;
        } else {
            process.env.SUPABASE_SECRET_KEY = supabaseKey;
        }

        await handler(
            { method, body },
            res
        );

        return res;

    } finally {
        globalThis.fetch = originalFetch;

        if (originalUrl === undefined) {
            delete process.env.SUPABASE_URL;
        } else {
            process.env.SUPABASE_URL = originalUrl;
        }

        if (originalKey === undefined) {
            delete process.env.SUPABASE_SECRET_KEY;
        } else {
            process.env.SUPABASE_SECRET_KEY = originalKey;
        }
    }
}

function successfulFetch(capture = {}) {
    return async (url, options = {}) => {
        if (String(url).includes("api.minepi.com/v2/me")) {
            capture.piCalls = (capture.piCalls || 0) + 1;

            return response(200, {
                uid: "verified-pi-user-123",
                username: "verifieduser"
            });
        }

        if (String(url).includes("/rest/v1/requests")) {
            capture.supabaseCalls =
                (capture.supabaseCalls || 0) + 1;

            capture.insertUrl = String(url);
            capture.options = options;
            capture.insertBody = JSON.parse(options.body);

            return response(201, [{
                id: 123,
                service: "Web Development",
                status: "Submitted",
                review_status: "Waiting for review",
                order_status: "Pending",
                created_at: "2026-11-11T10:00:00Z"
            }]);
        }

        throw new Error("Unexpected URL");
    };
}

test("Reject non-POST method", async () => {
    let called = false;

    const result = await invoke({
        method: "GET",
        fetchImpl: async () => {
            called = true;
        }
    });

    assert.equal(result.statusCode, 405);
    assert.equal(result.headers.Allow, "POST");
    assert.equal(called, false);
});

test("Reject malformed JSON body", async () => {
    const result = await invoke({
        body: "{invalid-json"
    });

    assert.equal(result.statusCode, 400);
    assert.equal(result.data.success, false);
});

test("Reject unavailable service without calling Pi API", async () => {
    let called = false;

    const result = await invoke({
        body: {
            ...validBody,
            service: "Unavailable Service"
        },
        fetchImpl: async () => {
            called = true;
        }
    });

    assert.equal(result.statusCode, 400);
    assert.equal(called, false);
});

test("Reject invalid name length", async () => {
    const result = await invoke({
        body: {
            ...validBody,
            name: "A"
        }
    });

    assert.equal(result.statusCode, 400);
});

test("Reject missing required fields", async () => {
    const result = await invoke({
        body: {
            service: "Web Development"
        }
    });

    assert.equal(result.statusCode, 400);
});

test("Reject invalid Pi identity without Supabase insert", async () => {
    let supabaseCalled = false;

    const result = await invoke({
        fetchImpl: async (url) => {
            if (String(url).includes("api.minepi.com")) {
                return response(401, {});
            }

            supabaseCalled = true;
            throw new Error("Supabase must not be called");
        }
    });

    assert.equal(result.statusCode, 401);
    assert.equal(result.data.success, false);
    assert.equal(supabaseCalled, false);
});

test("Reject missing Supabase configuration", async () => {
    let called = false;

    const result = await invoke({
        supabaseKey: "",
        fetchImpl: async () => {
            called = true;
        }
    });

    assert.equal(result.statusCode, 500);
    assert.equal(called, false);
});

test("Reject unsafe Supabase URL", async () => {
    let called = false;

    const result = await invoke({
        supabaseUrl: "http://example.com",
        fetchImpl: async () => {
            called = true;
        }
    });

    assert.equal(result.statusCode, 500);
    assert.equal(called, false);
});

test("Create request using verified Pi identity", async () => {
    const capture = {};

    const result = await invoke({
        fetchImpl: successfulFetch(capture)
    });

    assert.equal(result.statusCode, 201);
    assert.equal(result.data.success, true);
    assert.equal(result.data.request.id, 123);

    assert.equal(capture.piCalls, 1);
    assert.equal(capture.supabaseCalls, 1);

    assert.equal(
        capture.insertBody.pi_username,
        "verifieduser"
    );

    assert.notEqual(
        capture.insertBody.pi_username,
        "attacker_username"
    );

    assert.equal(
        capture.insertBody.status,
        "Submitted"
    );

    assert.equal(
        capture.insertBody.review_status,
        "Waiting for review"
    );

    assert.equal(
        capture.insertBody.order_status,
        "Pending"
    );

    assert.equal(
        capture.options.method,
        "POST"
    );

    assert.equal(
        capture.options.headers.apikey,
        SUPABASE_KEY
    );

    assert.match(
        capture.insertUrl,
        /\/rest\/v1\/requests\?select=/
    );
});

test("Return 500 when Supabase rejects request insert", async () => {
    const fetchImpl = async (url) => {
        if (String(url).includes("api.minepi.com")) {
            return response(200, {
                uid: "verified-pi-user-123",
                username: "verifieduser"
            });
        }

        return response(400, {
            message: "Database insert rejected"
        });
    };

    const result = await invoke({ fetchImpl });

    assert.equal(result.statusCode, 500);
    assert.equal(result.data.success, false);
});

test("Return 503 when Supabase request times out", async () => {
    const fetchImpl = async (url) => {
        if (String(url).includes("api.minepi.com")) {
            return response(200, {
                uid: "verified-pi-user-123",
                username: "verifieduser"
            });
        }

        const error = new Error("Request aborted");
        error.name = "AbortError";
        throw error;
    };

    const result = await invoke({ fetchImpl });

    assert.equal(result.statusCode, 503);
    assert.equal(result.data.success, false);
});
