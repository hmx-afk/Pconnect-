// ==========================================
// PConnect - Pi SDK Testnet
// Authentication Diagnostics + Payments
// Incomplete Payment Recovery
// ==========================================

"use strict";

// ==========================================
// PI SDK INITIALIZATION
// ==========================================

let piSdkReady = false;
let piInitError = null;

try {
    if (typeof window.Pi === "undefined") {
        throw new Error(
            "Pi SDK is unavailable. Open this page inside Pi Browser."
        );
    }

    window.Pi.init({
        version: "2.0",
        sandbox: true
    });

    piSdkReady = true;

    console.log("[PConnect] Pi SDK initialized.");

} catch (error) {
    piInitError = error;

    console.error(
        "[PConnect] Pi SDK initialization failed:",
        error
    );
}

// ==========================================
// DOM ELEMENTS
// ==========================================

const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("piStatus");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");

// ==========================================
// CURRENT PI USER
// Access token stays in memory only.
// ==========================================

let currentPiUsername = null;
let currentPiAccessToken = "";

// ==========================================
// INCOMPLETE PAYMENT RECOVERY
// ==========================================

let pendingIncompletePayment = null;
let processingIncompletePayment = false;

// ==========================================
// REQUEST ID
// ==========================================

const urlParams = new URLSearchParams(
    window.location.search
);

const urlRequestId = urlParams.get("request_id");

if (urlRequestId) {
    sessionStorage.setItem(
        "pconnect_request_id",
        urlRequestId
    );
}

const currentRequestId =
    urlRequestId ||
    sessionStorage.getItem("pconnect_request_id");

// ==========================================
// SERVICE
// ==========================================

const currentService = "Web Development";

console.log(
    "[PConnect] Request ID:",
    currentRequestId
);

console.log(
    "[PConnect] Service:",
    currentService
);

// ==========================================
// REQUIRED ELEMENTS
// ==========================================

if (!loginBtn) {
    console.warn("[PConnect] loginBtn not found.");
}

if (!status) {
    console.warn("[PConnect] piStatus not found.");
}

if (!payBtn) {
    console.warn("[PConnect] payBtn not found.");
}

if (!payStatus) {
    console.warn("[PConnect] payStatus not found.");
}

// ==========================================
// SAFE STATUS HELPERS
// ==========================================

function setPiStatus(message) {
    if (status) {
        status.textContent = message;
    }
}

function setPayStatus(message) {
    if (payStatus) {
        payStatus.textContent = message;
    }
}

function setPaymentEnabled(enabled) {
    if (payBtn) {
        payBtn.disabled = !enabled;
    }
}

// ==========================================
// PI API HEADERS
// ==========================================

function piJsonHeaders() {
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    if (currentPiAccessToken) {
        headers.Authorization =
            "Bearer " + currentPiAccessToken;
    }

    return headers;
}

// ==========================================
// ERROR HELPER
// ==========================================

function getErrorMessage(error) {
    if (!error) {
        return "Unknown error.";
    }

    if (typeof error === "string") {
        return error;
    }

    if (error.message) {
        return error.message;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

// ==========================================
// REFRESH PAGE DATA
// ==========================================

async function refreshPaymentPageData() {
    if (typeof window.loadTransactions === "function") {
        try {
            await window.loadTransactions();
        } catch (error) {
            console.error(
                "[PConnect] Transaction refresh failed:",
                error
            );
        }
    }

    if (typeof window.loadDashboard === "function") {
        try {
            await window.loadDashboard();
        } catch (error) {
            console.error(
                "[PConnect] Dashboard refresh failed:",
                error
            );
        }
    }

    if (typeof window.loadNotifications === "function") {
        try {
            await window.loadNotifications();
        } catch (error) {
            console.error(
                "[PConnect] Notification refresh failed:",
                error
            );
        }
    }
}

// ==========================================
// INCOMPLETE PAYMENT CALLBACK
// Pi can invoke this before authentication
// returns an access token.
// ==========================================

function onIncompletePaymentFound(payment) {
    console.log(
        "[PConnect] Incomplete payment callback received."
    );

    if (!payment || !payment.identifier) {
        console.warn(
            "[PConnect] Incomplete payment has no identifier."
        );
        return;
    }

    // Do not replace a different pending payment silently.
    if (
        pendingIncompletePayment &&
        pendingIncompletePayment.identifier !== payment.identifier
    ) {
        console.error(
            "[PConnect] Another incomplete payment is already pending."
        );

        setPaymentEnabled(false);

        setPayStatus(
            "An incomplete payment needs attention. Do not start another payment."
        );

        return;
    }

    // Keep the original Pi payment object for recovery.
    pendingIncompletePayment = payment;

    setPaymentEnabled(false);

    if (!currentPiAccessToken) {
        setPayStatus(
            "An incomplete payment was found. Waiting for Pi login to finish..."
        );

        console.log(
            "[PConnect] Incomplete payment queued until login finishes."
        );

        return;
    }

    // Login has already completed; try recovery.
    processIncompletePayment(payment);
}

// ==========================================
// PROCESS INCOMPLETE PAYMENT
// ==========================================

async function processIncompletePayment(payment) {
    if (
        !payment ||
        !payment.identifier ||
        !currentPiAccessToken ||
        processingIncompletePayment
    ) {
        return;
    }

    const txid =
        payment.transaction &&
        payment.transaction.txid;

    if (!txid || typeof txid !== "string") {
        pendingIncompletePayment = payment;

        setPaymentEnabled(false);

        setPayStatus(
            "The previous payment has no transaction ID yet. Do not start another payment."
        );

        console.warn(
            "[PConnect] Incomplete payment has no valid txid."
        );

        return;
    }

    processingIncompletePayment = true;

    setPaymentEnabled(false);

    setPayStatus(
        "Recovering your previous Pi payment..."
    );

    try {
        const response = await fetch("/api/complete", {
            method: "POST",

            headers: piJsonHeaders(),

            // The backend reads request_id from Pi metadata.
            body: JSON.stringify({
                paymentId: payment.identifier,
                txid: txid
            })
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The payment server returned an invalid response."
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Could not complete the incomplete payment."
            );
        }

        console.log(
            "[PConnect] Incomplete payment recovered:",
            data
        );

        pendingIncompletePayment = null;

        setPayStatus(
            "Previous Pi payment recovered successfully."
        );

        await refreshPaymentPageData();

    } catch (error) {
        console.error(
            "[PConnect] Incomplete payment recovery failed:",
            error
        );

        // Retain the payment for another recovery attempt.
        pendingIncompletePayment = payment;

        setPayStatus(
            "Previous payment recovery failed: " +
            getErrorMessage(error) +
            ". Do not create another payment yet."
        );

    } finally {
        processingIncompletePayment = false;

        setPaymentEnabled(
            !pendingIncompletePayment &&
            Boolean(currentPiUsername) &&
            Boolean(currentPiAccessToken)
        );
    }
}

// ==========================================
// PI LOGIN
// ==========================================

if (loginBtn) {
    loginBtn.addEventListener("click", async function () {
        if (loginBtn.disabled) {
            return;
        }

        setPiStatus("Connecting to Pi...");

        setPayStatus(
            "Waiting for Pi authentication..."
        );

        loginBtn.disabled = true;
        setPaymentEnabled(false);

        let loginTimeout = null;
        let timedOut = false;

        try {
            if (!piSdkReady) {
                throw piInitError || new Error(
                    "Pi SDK did not initialize. Open PConnect in Pi Browser."
                );
            }

            if (
                !window.Pi ||
                typeof window.Pi.authenticate !== "function"
            ) {
                throw new Error(
                    "Pi.authenticate is unavailable."
                );
            }

            console.log(
                "[PConnect] Starting Pi authentication."
            );

            const scopes = [
                "username",
                "payments"
            ];

            const timeoutPromise = new Promise(
                function (_, reject) {
                    loginTimeout = setTimeout(
                        function () {
                            timedOut = true;

                            reject(new Error(
                                "Pi authentication timed out after 15 seconds. Please retry in Pi Browser."
                            ));
                        },
                        15000
                    );
                }
            );

            const authPromise = window.Pi.authenticate(
                scopes,
                onIncompletePaymentFound
            );

            const authResult = await Promise.race([
                authPromise,
                timeoutPromise
            ]);

            if (loginTimeout) {
                clearTimeout(loginTimeout);
                loginTimeout = null;
            }

            console.log(
                "[PConnect] Authentication response received."
            );

            if (
                !authResult ||
                !authResult.user ||
                !authResult.user.username
            ) {
                throw new Error(
                    "Pi authentication returned no username."
                );
            }

            if (!authResult.accessToken) {
                throw new Error(
                    "Pi returned no access token."
                );
            }

            // Keep token in memory only.
            currentPiUsername =
                authResult.user.username;

            currentPiAccessToken =
                authResult.accessToken;

            // Store username only.
            sessionStorage.setItem(
                "pconnect_pi_username",
                currentPiUsername
            );

            setPiStatus(
                "Connected ✔️ " + currentPiUsername
            );

            console.log(
                "[PConnect] Authentication successful:",
                currentPiUsername
            );

            // Recover queued incomplete payment before
            // allowing the user to create another payment.
            if (pendingIncompletePayment) {
                setPaymentEnabled(false);

                setPayStatus(
                    "An incomplete Pi payment was found. Recovering it..."
                );

                await processIncompletePayment(
                    pendingIncompletePayment
                );
            }

            if (pendingIncompletePayment) {
                setPaymentEnabled(false);

                setPayStatus(
                    "The previous payment still needs attention. Do not start another payment."
                );
            } else {
                setPaymentEnabled(true);

                setPayStatus(
                    "Pi connected successfully. You can use the 0.01 π Test-Pi payment if your request is approved."
                );
            }

            await refreshPaymentPageData();

        } catch (error) {
            if (loginTimeout) {
                clearTimeout(loginTimeout);
                loginTimeout = null;
            }

            console.error(
                "[PConnect] Login failed:",
                error
            );

            currentPiUsername = null;
            currentPiAccessToken = "";

            sessionStorage.removeItem(
                "pconnect_pi_username"
            );

            setPaymentEnabled(false);

            setPiStatus(
                "Login failed: " + getErrorMessage(error)
            );

            setPayStatus(
                timedOut
                    ? "Pi sign-in did not return a result. Please retry in Pi Browser."
                    : "Pi login error: " + getErrorMessage(error)
            );

        } finally {
            loginBtn.disabled = false;
        }
    });
}

// ==========================================
// CREATE PI PAYMENT
// ==========================================

if (payBtn) {
    payBtn.addEventListener("click", function () {
        const amount = 0.01;

        if (!piSdkReady || !window.Pi) {
            setPayStatus(
                "Pi SDK is unavailable. Reload PConnect in Pi Browser."
            );
            return;
        }

        if (!currentPiUsername || !currentPiAccessToken) {
            setPayStatus(
                "Please sign in with Pi first."
            );
            return;
        }

        if (pendingIncompletePayment) {
            setPaymentEnabled(false);

            setPayStatus(
                "A previous Pi payment is still pending. Resolve it before starting another payment."
            );
            return;
        }

        if (!currentRequestId) {
            setPayStatus(
                "No approved request found. Open Payments from My Requests."
            );

            console.error(
                "[PConnect] Missing request_id."
            );

            return;
        }

        if (typeof window.Pi.createPayment !== "function") {
            setPayStatus(
                "Pi payment service is unavailable."
            );
            return;
        }

        payBtn.disabled = true;

        if (loginBtn) {
            loginBtn.disabled = true;
        }

        setPayStatus(
            "Processing 0.01 π Test-Pi payment..."
        );

        console.log(
            "[PConnect] Starting payment for request:",
            currentRequestId
        );

        try {
            window.Pi.createPayment(
                {
                    amount: amount,

                    memo: "Payment for PConnect service",

                    metadata: {
                        request_id: currentRequestId,
                        service: currentService,
                        test: true
                    }
                },

                {
                    // Server approval.
                    onReadyForServerApproval: async function (paymentId) {
                        console.log(
                            "[PConnect] Payment ready for approval:",
                            paymentId
                        );

                        try {
                            const response = await fetch(
                                "/api/approve",
                                {
                                    method: "POST",

                                    headers: piJsonHeaders(),

                                    body: JSON.stringify({
                                        paymentId: paymentId
                                    })
                                }
                            );

                            const data = await response.json();

                            if (!response.ok) {
                                throw new Error(
                                    data.error ||
                                    "Payment approval failed."
                                );
                            }

                            console.log(
                                "[PConnect] Approval response:",
                                data
                            );

                            setPayStatus(
                                "Payment approved. Waiting for the Pi transaction..."
                            );

                        } catch (error) {
                            console.error(
                                "[PConnect] Approval failed:",
                                error
                            );

                            setPayStatus(
                                "Payment approval failed: " +
                                getErrorMessage(error)
                            );

                            payBtn.disabled = false;

                            if (loginBtn) {
                                loginBtn.disabled = false;
                            }
                        }
                    },

                    // Server completion.
                    onReadyForServerCompletion: async function (
                        paymentId,
                        txid
                    ) {
                        console.log(
                            "[PConnect] Completing payment:",
                            paymentId,
                            txid
                        );

                        setPayStatus(
                            "Completing payment and saving transaction..."
                        );

                        try {
                            const response = await fetch(
                                "/api/complete",
                                {
                                    method: "POST",

                                    headers: piJsonHeaders(),

                                    body: JSON.stringify({
                                        paymentId: paymentId,
                                        txid: txid,
                                        pi_username: currentPiUsername,
                                        service: currentService,
                                        request_id: currentRequestId
                                    })
                                }
                            );

                            const data = await response.json();

                            if (!response.ok) {
                                throw new Error(
                                    data.error ||
                                    "Payment completion failed."
                                );
                            }

                            console.log(
                                "[PConnect] Completion response:",
                                data
                            );

                            setPayStatus(
                                "✔️ Payment complete! Request #" +
                                currentRequestId +
                                " has been linked to this transaction."
                            );

                            payBtn.disabled = false;

                            if (loginBtn) {
                                loginBtn.disabled = false;
                            }

                            await refreshPaymentPageData();

                        } catch (error) {
                            console.error(
                                "[PConnect] Completion failed:",
                                error
                            );

                            setPayStatus(
                                "Payment completion failed: " +
                                getErrorMessage(error)
                            );

                            payBtn.disabled = false;

                            if (loginBtn) {
                                loginBtn.disabled = false;
                            }
                        }
                    },

                    // User cancelled payment.
                    onCancel: function (paymentId) {
                        console.log(
                            "[PConnect] Payment cancelled:",
                            paymentId
                        );

                        setPayStatus(
                            "Payment cancelled."
                        );

                        payBtn.disabled = false;

                        if (loginBtn) {
                            loginBtn.disabled = false;
                        }
                    },

                    // Payment error.
                    onError: function (error, payment) {
                        console.error(
                            "[PConnect] Payment error:",
                            error,
                            payment
                        );

                        setPayStatus(
                            "Payment error: " +
                            getErrorMessage(error)
                        );

                        payBtn.disabled = false;

                        if (loginBtn) {
                            loginBtn.disabled = false;
                        }
                    }
                }
            );

        } catch (error) {
            console.error(
                "[PConnect] Could not start payment:",
                error
            );

            setPayStatus(
                "Could not start payment: " +
                getErrorMessage(error)
            );

            payBtn.disabled = false;

            if (loginBtn) {
                loginBtn.disabled = false;
            }
        }
    });
}

// ==========================================
// END
// ==========================================

console.log("[PConnect] app.js loaded.");
