import test from "node:test";
import assert from "node:assert/strict";

import {
    getPiBearerToken,
    verifyPiToken,
    verifyPi,
    isValidPaymentIdentifier,
} from "../lib/verifyPi.js";

const originalFetch = globalThis.fetch;

function mockFetch(fn) {
    globalThis.fetch = fn;
}

function restoreFetch() {
    globalThis.fetch = originalFetch;
}

test("Extract valid Bearer token", () => {
    const token = "abcdefghijklmnopqrstuvwxyz123456";

    assert.equal(
        getPiBearerToken({
            headers: {
                authorization: `Bearer ${token}`
            }
        }),
        token
    );
});

test("Reject missing Bearer token", () => {
    assert.equal(
        getPiBearerToken({ headers: {} }),
        null
    );
});

test("Reject invalid token without calling Pi API", async () => {
    let called = false;

    mockFetch(async () => {
        called = true;
    });

    try {
        const result = await verifyPiToken("short");

        assert.equal(result.ok, false);
        assert.equal(result.status, 401);
        assert.equal(called, false);
    } finally {
        restoreFetch();
    }
});

test("Accept valid Pi identity", async () => {
    mockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            uid: "test-user-123",
            username: "testuser"
        })
    }));

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, true);
        assert.equal(result.uid, "test-user-123");
        assert.equal(result.username, "testuser");
    } finally {
        restoreFetch();
    }
});

test("Reject invalid Pi authentication", async () => {
    mockFetch(async () => ({
        ok: false,
        status: 401
    }));

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, 401);
    } finally {
        restoreFetch();
    }
});

test("Handle Pi upstream failure", async () => {
    mockFetch(async () => ({
        ok: false,
        status: 500
    }));

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, 503);
    } finally {
        restoreFetch();
    }
});

test("Reject invalid Pi username", async () => {
    mockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            uid: "test-user-123",
            username: "invalid username!"
        })
    }));

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, 401);
    } finally {
        restoreFetch();
    }
});

test("Handle malformed Pi JSON", async () => {
    mockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => {
            throw new SyntaxError("Invalid JSON");
        }
    }));

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, 502);
    } finally {
        restoreFetch();
    }
});

test("Handle Pi API timeout", async () => {
    mockFetch(async () => {
        const error = new Error("Request aborted");
        error.name = "AbortError";
        throw error;
    });

    try {
        const result = await verifyPiToken(
            "abcdefghijklmnopqrstuvwxyz123456"
        );

        assert.equal(result.ok, false);
        assert.equal(result.status, 504);
    } finally {
        restoreFetch();
    }
});

test("Verify Pi identity from Bearer request", async () => {
    mockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            uid: "test-user-123",
            username: "testuser"
        })
    }));

    try {
        const result = await verifyPi({
            headers: {
                authorization:
                    "Bearer abcdefghijklmnopqrstuvwxyz123456"
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.username, "testuser");
    } finally {
        restoreFetch();
    }
});


test("Accept valid payment identifiers", () => {
    for (const value of [
        "payment123",
        "ABCxyz789",
        "payment-id_123"
    ]) {
        assert.equal(isValidPaymentIdentifier(value), true);
    }
});

test("Reject unsafe payment identifier characters", () => {
    for (const value of [
        "payment/id",
        "payment,id",
        "payment(id)",
        "payment id",
        "payment.id"
    ]) {
        assert.equal(isValidPaymentIdentifier(value), false);
    }
});

test("Reject empty, non-string and oversized payment identifiers", () => {
    for (const value of [
        "",
        "   ",
        null,
        undefined,
        123,
        "a".repeat(201)
    ]) {
        assert.equal(isValidPaymentIdentifier(value), false);
    }
});

test("Accept payment identifiers up to 200 characters", () => {
    assert.equal(isValidPaymentIdentifier("a".repeat(200)), true);
});
