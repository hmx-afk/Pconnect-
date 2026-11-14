// ==========================================
// PConnect - Secure Profile
// Pi Testnet
// Server-Side Identity Verification
// ==========================================

"use strict";

const AUTH_TIMEOUT_MS = 15000;
const API_TIMEOUT_MS = 15000;

let piInitialized = false;
let loginInProgress = false;
let currentUsername = "";
let piAccessToken = "";

const loginBtn = document.getElementById("loginBtn");

const usernameElement = document.getElementById("username");
const piUsernameElement = document.getElementById("piUsername");
const avatarElement = document.getElementById("avatar");

const connectionStatus = document.getElementById("connectionStatus");
const message = document.getElementById("message");

const transactionCount = document.getElementById("transactionCount");
const completedCount = document.getElementById("completedCount");

const requestCount = document.getElementById("requestCount");
const waitingCount = document.getElementById("waitingCount");
const approvedCount = document.getElementById("approvedCount");
const rejectedCount = document.getElementById("rejectedCount");

// ==========================================
// Timeout Helper
// ==========================================

function withTimeout(promise, ms, errorMessage) {

    let timer;

    const timeout = new Promise(function (_, reject) {

        timer = setTimeout(function () {
            reject(new Error(errorMessage));
        }, ms);

    });

    return Promise.race([promise, timeout])
        .finally(function () {
            clearTimeout(timer);
        });
}

// ==========================================
// Initialize Pi SDK
// ==========================================

function initializePi() {

    if (typeof Pi === "undefined") {
        throw new Error(
            "Pi SDK is unavailable. Please open PConnect in Pi Browser."
        );
    }

    if (!piInitialized) {

        Pi.init({
            version: "2.0",
            sandbox: true
        });

        piInitialized = true;
    }
}

// ==========================================
// Reset Statistics
// ==========================================

function resetStatistics() {

    requestCount.textContent = "—";
    waitingCount.textContent = "—";
    approvedCount.textContent = "—";
    rejectedCount.textContent = "—";

    transactionCount.textContent = "—";
    completedCount.textContent = "—";
}

// ==========================================
// Secure API Request
// ==========================================

async function fetchApi(url) {

    const response = await withTimeout(

        fetch(url, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Authorization": "Bearer " + piAccessToken,
                "Accept": "application/json"
            }
        }),

        API_TIMEOUT_MS,

        "Server request timed out. Please refresh and try again."

    );

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("Invalid server response.");
    }

    if (!response.ok || !data.success) {

        if (response.status === 401) {
            throw new Error(
                "Pi authentication expired. Please sign in again."
            );
        }

        throw new Error(
            data.error || "Unable to load account information."
        );
    }

    return data;
}

// ==========================================
// Authenticate Pi User
// ==========================================

async function authenticatePi() {

    initializePi();

    const auth = await withTimeout(

        Pi.authenticate(["username"]),

        AUTH_TIMEOUT_MS,

        "Pi sign-in timed out. Please try again."

    );

    if (
        !auth ||
        !auth.accessToken ||
        !auth.user ||
        !auth.user.username
    ) {

        throw new Error(
            "Pi authentication was not completed."
        );
    }

    currentUsername = auth.user.username;
    piAccessToken = auth.accessToken;

    return currentUsername;
}

// ==========================================
// Load Requests
// ==========================================

async function loadRequests() {

    const data = await fetchApi("/api/my-requests");

    const verifiedUsername =
        data.user && data.user.username;

    if (verifiedUsername !== currentUsername) {
        throw new Error(
            "Verified Pi account does not match."
        );
    }

    if (!Array.isArray(data.requests)) {
        throw new Error("Invalid requests data.");
    }

    const requests = data.requests;

    requestCount.textContent = requests.length;

    waitingCount.textContent = requests.filter(function (request) {

        const status = String(request.review_status || "")
            .trim()
            .toLowerCase();

        return (
            status === "waiting" ||
            status === "pending" ||
            status.includes("waiting") ||
            status.includes("review")
        );

    }).length;

    approvedCount.textContent = requests.filter(function (request) {

        return String(request.review_status || "")
            .trim()
            .toLowerCase() === "approved";

    }).length;

    rejectedCount.textContent = requests.filter(function (request) {

        return String(request.review_status || "")
            .trim()
            .toLowerCase() === "rejected";

    }).length;

}

// ==========================================
// Load Transactions
// ==========================================

async function loadTransactions() {

    const data = await fetchApi("/api/transactions");

    const verifiedUsername =
        data.user && data.user.username;

    if (verifiedUsername !== currentUsername) {
        throw new Error(
            "Transaction account verification failed."
        );
    }

    if (!Array.isArray(data.transactions)) {
        throw new Error("Invalid transactions data.");
    }

    const transactions = data.transactions;

    transactionCount.textContent = transactions.length;

    const completed = transactions.filter(function (transaction) {

        return String(transaction.status || "")
            .trim()
            .toLowerCase() === "completed";

    }).length;

    completedCount.textContent = completed;

}

// ==========================================
// Update Profile Display
// ==========================================

function showConnectedProfile() {

    usernameElement.textContent = currentUsername;

    piUsernameElement.textContent = currentUsername;

    avatarElement.textContent =
        currentUsername.charAt(0).toUpperCase();

    connectionStatus.textContent = "🟢 Connected with Pi";

    loginBtn.textContent = "Connected ✔️";

    loginBtn.disabled = true;

}

// ==========================================
// Login
// ==========================================

loginBtn.addEventListener("click", async function () {

    if (loginInProgress) return;

    loginInProgress = true;

    loginBtn.disabled = true;
    loginBtn.textContent = "Connecting...";

    resetStatistics();

    try {

        await authenticatePi();

        showConnectedProfile();

        message.textContent =
            "Pi account verified. Loading your account information...";

        const results = await Promise.allSettled([

            loadRequests(),

            loadTransactions()

        ]);

        const requestsLoaded = results[0].status === "fulfilled";
        const transactionsLoaded = results[1].status === "fulfilled";

        if (requestsLoaded && transactionsLoaded) {

            message.textContent =
                "Your Pi profile and account statistics are up to date.";

        } else if (requestsLoaded || transactionsLoaded) {

            message.textContent =
                "Your profile is connected, but some account statistics could not be loaded. Please try again.";

            console.error("Profile loading results:", results);

            loginBtn.textContent = "Refresh Profile";
            loginBtn.disabled = false;

        } else {

            message.textContent =
                "Pi account connected, but account statistics could not be loaded. Please try again.";

            console.error("Profile loading results:", results);

            loginBtn.textContent = "Refresh Profile";
            loginBtn.disabled = false;

        }

    } catch (error) {

        console.error("Profile authentication error:", error);

        currentUsername = "";
        piAccessToken = "";

        usernameElement.textContent = "Not connected";
        piUsernameElement.textContent = "Not available";
        avatarElement.textContent = "?";

        connectionStatus.textContent = "⚠️ Connection failed";

        message.textContent =
            error.message || "Could not connect with Pi.";

        loginBtn.textContent = "Sign in with Pi";
        loginBtn.disabled = false;

        resetStatistics();

    } finally {

        loginInProgress = false;

    }

});
