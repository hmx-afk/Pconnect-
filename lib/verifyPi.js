
// ==========================================
// PConnect - Secure Pi Identity Verification
// Pi Testnet | Shared Authentication Helper
// ==========================================

"use strict";

const PI_ME_URL = "https://api.minepi.com/v2/me";
const PI_API_TIMEOUT = 10000;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4096;
const MAX_USERNAME_LENGTH = 50;
const MAX_UID_LENGTH = 200;

// ==========================================
// EXTRACT BEARER TOKEN
// ==========================================

export function getPiBearerToken(req) {
    const authorization =
        typeof req?.headers?.authorization === "string"
            ? req.headers.authorization
            : "";

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) return null;

    return match[1].trim();
}

// ==========================================
// VERIFY PI ACCESS TOKEN
// ==========================================

export async function verifyPiToken(accessToken) {

    if (
        typeof accessToken !== "string" ||
        accessToken.length < MIN_TOKEN_LENGTH ||
        accessToken.length > MAX_TOKEN_LENGTH
    ) {
        return {
            ok: false,
            status: 401,
            error: "Invalid Pi authentication"
        };
    }

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        PI_API_TIMEOUT
    );

    try {

        const response = await fetch(
            PI_ME_URL,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json"
                },
                signal: controller.signal
            }
        );

        if (response.status === 401 || response.status === 403) {
            return {
                ok: false,
                status: 401,
                error: "Pi authentication failed"
            };
        }

        if (!response.ok) {
            return {
                ok: false,
                status: 503,
                error: "Pi verification is temporarily unavailable"
            };
        }

        const user = await response.json();

        if (
            !user ||
            typeof user !== "object" ||
            Array.isArray(user)
        ) {
            return {
                ok: false,
                status: 502,
                error: "Invalid response from Pi Network"
            };
        }

        const uid =
            typeof user.uid === "string"
                ? user.uid.trim()
                : "";

        const username =
            typeof user.username === "string"
                ? user.username.trim()
                : "";

        if (
            !uid ||
            uid.length > MAX_UID_LENGTH ||
            !username ||
            username.length > MAX_USERNAME_LENGTH ||
            !/^[a-zA-Z0-9._-]+$/.test(username)
        ) {
            return {
                ok: false,
                status: 401,
                error: "Unable to verify Pi identity"
            };
        }

        return {
            ok: true,
            uid,
            username
        };

    } catch (error) {

        return {
            ok: false,
            status: 503,
            error: error.name === "AbortError"
                ? "Pi verification timed out"
                : "Pi verification is temporarily unavailable"
        };

    } finally {

        clearTimeout(timer);

    }
}

// ==========================================
// VERIFY PI IDENTITY FROM REQUEST
// ==========================================

export async function verifyPi(req) {

    const token = getPiBearerToken(req);

    if (!token) {
        return {
            ok: false,
            status: 401,
            error: "Pi authentication required"
        };
    }

    return verifyPiToken(token);
}
