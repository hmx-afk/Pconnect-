import test from "node:test";
import assert from "node:assert/strict";
import notificationsHandler from "../api/notifications.js";

const originalFetch = globalThis.fetch;

const envKeys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "ADMIN_REVIEW_KEY"
];

const originalEnv = Object.fromEntries(
    envKeys.map(key => [key, process.env[key]])
);

const SUPABASE_URL =
    "https://capjfdyyeaxvekqzsbbi.supabase.co";

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
        }
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

function configureEnv() {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    process.env.ADMIN_REVIEW_KEY = "test-admin-key";
}

async function invoke(method, options = {}) {
    configureEnv();

    const req = {
        method,
        headers: options.headers || {},
        body: options.body
    };

    const res = createResponse();

    await notificationsHandler(req, res);

    return {
        statusCode: res.statusCode,
        body: res.body,
        headers: res.headers
    };
}

function mockPiIdentity(username = "hamzaomar62") {
    return jsonResponse({
        uid: "test-pi-uid",
        username
    });
}

test("Notifications rejects unsupported methods", async () => {
    let calls = 0;

    globalThis.fetch = async () => {
        calls++;
        throw new Error("Unexpected fetch");
    };

    const result = await invoke("DELETE");

    assert.equal(result.statusCode, 405);
    assert.equal(result.headers.Allow, "GET, POST, PATCH");
    assert.equal(calls, 0);
});

test("Notifications rejects missing Supabase configuration", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    globalThis.fetch = async () => {
        throw new Error("Unexpected fetch");
    };

    const result = await invokeWithoutEnv("GET");

    assert.equal(result.statusCode, 500);
    assert.equal(result.body.success, false);
});

async function invokeWithoutEnv(method, options = {}) {
    const req = {
        method,
        headers: options.headers || {},
        body: options.body
    };

    const res = createResponse();

    await notificationsHandler(req, res);

    return {
        statusCode: res.statusCode,
        body: res.body
    };
}

test("Notifications GET rejects missing Pi bearer token", async () => {
    let calls = 0;

    globalThis.fetch = async () => {
        calls++;
        throw new Error("Unexpected fetch");
    };

    const result = await invoke("GET");

    assert.equal(result.statusCode, 401);
    assert.equal(calls, 0);
});

test("Notifications GET returns only verified user's notifications", async () => {
    let calls = 0;
    let notificationsUrl = "";

    globalThis.fetch = async (url) => {
        calls++;

        if (String(url).includes("/v2/me")) {
            return mockPiIdentity();
        }

        notificationsUrl = String(url);

        return jsonResponse([
            {
                id: 1,
                request_id: 10,
                type: "approved",
                title: "Request approved",
                message: "Your request was approved",
                is_read: false
            }
        ]);
    };

    const result = await invoke("GET", {
        headers: {
            authorization: "Bearer test-pi-token-123456789"
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.notifications.length, 1);
    assert.equal(calls, 2);

    const url = new URL(notificationsUrl);

    assert.equal(
        url.searchParams.get("pi_username"),
        "eq.hamzaomar62"
    );

    assert.equal(url.searchParams.get("limit"), "50");
});

test("Notifications POST rejects missing admin key", async () => {
    let calls = 0;

    globalThis.fetch = async () => {
        calls++;
        throw new Error("Unexpected fetch");
    };

    const result = await invoke("POST", {
        body: {
            request_id: 10,
            type: "approved",
            title: "Approved",
            message: "Your request was approved"
        }
    });

    assert.equal(result.statusCode, 401);
    assert.equal(calls, 0);
});

test("Notifications POST rejects invalid request ID", async () => {
    let calls = 0;

    globalThis.fetch = async () => {
        calls++;
        throw new Error("Unexpected fetch");
    };

    const result = await invoke("POST", {
        headers: {
            "x-admin-key": "test-admin-key"
        },
        body: {
            request_id: 0,
            type: "approved",
            title: "Approved",
            message: "Your request was approved"
        }
    });

    assert.equal(result.statusCode, 400);
    assert.equal(calls, 0);
});

test("Notifications POST creates notification for verified request owner", async () => {
    let calls = 0;
    let insertedBody = null;

    globalThis.fetch = async (url, options = {}) => {
        calls++;

        const target = String(url);

        if (target.includes("/requests?")) {
            return jsonResponse([
                {
                    id: 10,
                    pi_username: "hamzaomar62"
                }
            ]);
        }

        if (
            target.includes("/notifications?") &&
            (!options.method || options.method === "GET")
        ) {
            return jsonResponse([]);
        }

        if (
            target.endsWith("/notifications") &&
            options.method === "POST"
        ) {
            insertedBody = JSON.parse(options.body);

            return jsonResponse([
                {
                    id: 20,
                    ...insertedBody
                }
            ], 201);
        }

        throw new Error(`Unexpected request: ${target}`);
    };

    const result = await invoke("POST", {
        headers: {
            "x-admin-key": "test-admin-key"
        },
        body: {
            request_id: 10,
            type: "approved",
            title: "Request approved",
            message: "Your request was approved"
        }
    });

    assert.equal(result.statusCode, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.notification.id, 20);
    assert.equal(insertedBody.pi_username, "hamzaomar62");
    assert.equal(insertedBody.is_read, false);
    assert.equal(calls, 3);
});

test("Notifications POST prevents duplicate notifications", async () => {
    let calls = 0;

    globalThis.fetch = async (url) => {
        calls++;

        if (String(url).includes("/requests?")) {
            return jsonResponse([
                {
                    id: 10,
                    pi_username: "hamzaomar62"
                }
            ]);
        }

        return jsonResponse([{ id: 20 }]);
    };

    const result = await invoke("POST", {
        headers: {
            "x-admin-key": "test-admin-key"
        },
        body: {
            request_id: 10,
            type: "approved",
            title: "Request approved",
            message: "Your request was approved"
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.duplicate, true);
    assert.equal(calls, 2);
});

test("Notifications PATCH rejects missing Pi bearer token", async () => {
    let calls = 0;

    globalThis.fetch = async () => {
        calls++;
        throw new Error("Unexpected fetch");
    };

    const result = await invoke("PATCH", {
        body: { id: 20 }
    });

    assert.equal(result.statusCode, 401);
    assert.equal(calls, 0);
});

test("Notifications PATCH marks only the verified user's notification as read", async () => {
    let updateUrl = "";
    let updateBody = null;

    globalThis.fetch = async (url, options = {}) => {
        if (String(url).includes("/v2/me")) {
            return mockPiIdentity();
        }

        updateUrl = String(url);
        updateBody = JSON.parse(options.body);

        return jsonResponse([
            {
                id: 20,
                pi_username: "hamzaomar62",
                is_read: true
            }
        ]);
    };

    const result = await invoke("PATCH", {
        headers: {
            authorization: "Bearer test-pi-token-123456789"
        },
        body: {
            id: 20
        }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.notification.is_read, true);
    assert.equal(updateBody.is_read, true);

    const url = new URL(updateUrl);

    assert.equal(url.searchParams.get("id"), "eq.20");
    assert.equal(
        url.searchParams.get("pi_username"),
        "eq.hamzaomar62"
    );
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
