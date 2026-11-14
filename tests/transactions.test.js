import test from "node:test";
import assert from "node:assert/strict";
import transactionsHandler from "../api/transactions.js";

const originalFetch = globalThis.fetch;

const envKeys = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY"
];

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]])
);

const SUPABASE_URL =
  "https://capjfdyyeaxvekqzsbbi.supabase.co";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
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
  process.env.SUPABASE_SECRET_KEY = "test-supabase-secret";
}

async function invoke(method = "GET", options = {}) {
  configureEnv();

  const req = {
    method,
    headers: options.headers || {}
  };

  const res = createResponse();

  await transactionsHandler(req, res);

  return {
    status: res.statusCode,
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

test("Transactions rejects unsupported methods", async () => {
  let calls = 0;

  globalThis.fetch = async () => {
    calls++;
    throw new Error("Fetch should not be called");
  };

  const result = await invoke("POST");

  assert.equal(result.status, 405);
  assert.match(result.headers.Allow, /GET/);
  assert.equal(calls, 0);
});

test("Transactions rejects missing Supabase configuration", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;

  globalThis.fetch = async () => {
    throw new Error("Fetch should not be called");
  };

  const req = {
    method: "GET",
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  };

  const res = createResponse();

  await transactionsHandler(req, res);

  assert.equal(res.statusCode, 500);
});

test("Transactions rejects unsafe Supabase URL", async () => {
  process.env.SUPABASE_URL =
    "http://capjfdyyeaxvekqzsbbi.supabase.co";

  process.env.SUPABASE_SECRET_KEY = "test-supabase-secret";

  globalThis.fetch = async () => {
    throw new Error("Fetch should not be called");
  };

  const req = {
    method: "GET",
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  };

  const res = createResponse();

  await transactionsHandler(req, res);

  assert.equal(res.statusCode, 500);
});

test("Transactions rejects missing Pi bearer token", async () => {
  let calls = 0;

  globalThis.fetch = async () => {
    calls++;
    throw new Error("Fetch should not be called");
  };

  const result = await invoke("GET");

  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("Transactions rejects invalid Pi identity", async () => {
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));

    if (String(url).includes("/v2/me")) {
      return jsonResponse(
        { error: "Unauthorized" },
        401
      );
    }

    throw new Error("Supabase should not be called");
  };

  const result = await invoke("GET", {
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  });

  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/v2\/me/);
});

test("Transactions returns only verified user's transactions", async () => {
  const calls = [];

  const transactions = [
    {
      request_id: 5,
      amount: 0.01,
      currency: "Pi",
      status: "Completed",
      service: "Web Development",
      pi_username: "hamzaomar62",
      created_at: "2026-11-12T10:00:00Z"
    }
  ];

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);

    calls.push({
      url: target,
      method: options.method || "GET"
    });

    if (target.includes("/v2/me")) {
      return mockPiIdentity();
    }

    if (target.includes("/rest/v1/transactions")) {
      return jsonResponse(transactions);
    }

    throw new Error(`Unexpected URL: ${target}`);
  };

  const result = await invoke("GET", {
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.user.username, "hamzaomar62");
  assert.equal(result.body.transactions.length, 1);
  assert.equal(
    result.body.transactions[0].request_id,
    5
  );

  const databaseCall = calls.find(call =>
    call.url.includes("/rest/v1/transactions")
  );

  assert.ok(databaseCall, "Supabase transactions query was not called");

  const query = new URL(databaseCall.url).searchParams;

  assert.equal(
    query.get("pi_username"),
    "eq.hamzaomar62"
  );

  assert.equal(query.get("limit"), "100");
  assert.equal(query.get("order"), "created_at.desc");
  assert.equal(calls.length, 2);
});

test("Transactions handles Supabase database errors", async () => {
  globalThis.fetch = async url => {
    if (String(url).includes("/v2/me")) {
      return mockPiIdentity();
    }

    return jsonResponse(
      {
        message: "Database unavailable",
        code: "TEST_ERROR"
      },
      500
    );
  };

  const result = await invoke("GET", {
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  });

  assert.equal(result.status, 500);
});

test("Transactions returns 504 when Supabase throws AbortError", async () => {
  globalThis.fetch = async url => {
    if (String(url).includes("/v2/me")) {
      return mockPiIdentity();
    }

    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };

  const result = await invoke("GET", {
    headers: {
      authorization: "Bearer test-pi-token-123456789"
    }
  });

  assert.equal(result.status, 504);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /timed out/i);
});
