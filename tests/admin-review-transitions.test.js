import test from "node:test";
import assert from "node:assert/strict";

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

function createResponse(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(data)
    };
}

async function runScenario({
    action,
    reviewStatus,
    orderStatus,
    patchData = null
}) {
    process.env.SUPABASE_URL =
        "https://capjfdyyeaxvekqzsbbi.supabase.co";

    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    process.env.ADMIN_REVIEW_KEY = "test-admin-secret";

    const calls = [];

    const requestRow = {
        id: 1,
        service: "Web Development",
        pi_username: "",
        review_status: reviewStatus,
        order_status: orderStatus
    };

    globalThis.fetch = async (url, options = {}) => {
        calls.push({
            url: String(url),
            method: options.method || "GET",
            body: options.body
        });

        if (calls.length === 1) {
            return createResponse([requestRow]);
        }

        if (calls.length === 2) {
            return createResponse(
                patchData === null
                    ? [{
                        ...requestRow,
                        ...JSON.parse(options.body)
                    }]
                    : patchData
            );
        }

        throw new Error("Unexpected external request");
    };

    const req = {
        method: "POST",
        headers: {
            "x-admin-key": "test-admin-secret"
        },
        body: {
            id: 1,
            action
        }
    };

    const res = {
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

    try {
        await adminReviewHandler(req, res);
    } finally {
        globalThis.fetch = originalFetch;
    }

    return {
        statusCode: res.statusCode,
        body: res.body,
        calls
    };
}

/* IN PROGRESS VALIDATION */

test("Reject In Progress when order is not Paid", async () => {
    const result = await runScenario({
        action: "in_progress",
        reviewStatus: "Approved",
        orderStatus: "Pending"
    });

    assert.equal(result.statusCode, 409);
    assert.equal(result.calls.length, 1);
});

test("Reject In Progress when request is not Approved", async () => {
    const result = await runScenario({
        action: "in_progress",
        reviewStatus: "Waiting for review",
        orderStatus: "Paid"
    });

    assert.equal(result.statusCode, 409);
    assert.equal(result.calls.length, 1);
});

/* COMPLETE VALIDATION */

test("Reject Complete when order is not In Progress", async () => {
    const result = await runScenario({
        action: "complete",
        reviewStatus: "Approved",
        orderStatus: "Paid"
    });

    assert.equal(result.statusCode, 409);
    assert.equal(result.calls.length, 1);
});

/* CANCEL VALIDATION */

test("Reject Cancel when order is not Pending", async () => {
    const result = await runScenario({
        action: "cancel",
        reviewStatus: "Approved",
        orderStatus: "In Progress"
    });

    assert.equal(result.statusCode, 409);
    assert.equal(result.calls.length, 1);
});

/* SUCCESSFUL TRANSITIONS */

test("Allow Approved and Paid request to enter In Progress", async () => {
    const result = await runScenario({
        action: "in_progress",
        reviewStatus: "Approved",
        orderStatus: "Paid"
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(
        result.body.request.order_status,
        "In Progress"
    );

    assert.equal(result.calls.length, 2);
    assert.equal(result.calls[1].method, "PATCH");

    const patchUrl = new URL(result.calls[1].url);

    assert.equal(
        patchUrl.searchParams.get("order_status"),
        "eq.Paid"
    );

    assert.equal(
        patchUrl.searchParams.get("review_status"),
        "eq.Approved"
    );
});

test("Allow Approved and In Progress request to complete", async () => {
    const result = await runScenario({
        action: "complete",
        reviewStatus: "Approved",
        orderStatus: "In Progress"
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(
        result.body.request.order_status,
        "Completed"
    );

    const patchUrl = new URL(result.calls[1].url);

    assert.equal(
        patchUrl.searchParams.get("order_status"),
        "eq.In Progress"
    );

    assert.equal(
        patchUrl.searchParams.get("review_status"),
        "eq.Approved"
    );
});

test("Allow Pending request to be cancelled", async () => {
    const result = await runScenario({
        action: "cancel",
        reviewStatus: "Waiting for review",
        orderStatus: "Pending"
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(
        result.body.request.order_status,
        "Cancelled"
    );

    const patchUrl = new URL(result.calls[1].url);

    assert.equal(
        patchUrl.searchParams.get("order_status"),
        "eq.Pending"
    );
});

/* RACE CONDITION */

test("Reject update when conditional PATCH changes no rows", async () => {
    const result = await runScenario({
        action: "in_progress",
        reviewStatus: "Approved",
        orderStatus: "Paid",
        patchData: []
    });

    assert.equal(result.statusCode, 409);
    assert.equal(result.body.success, false);
    assert.equal(result.calls.length, 2);
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
