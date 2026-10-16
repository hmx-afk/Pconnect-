// ==========================================
// PConnect - Pi SDK Testnet
// Authentication Diagnostics + Payments
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
// Access token remains in memory only.
// ==========================================

let currentPiUsername = null;
let currentPiAccessToken = "";


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
// DISPLAY DIAGNOSTIC ERROR
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
// PI LOGIN
// ==========================================

if (loginBtn) {

    loginBtn.addEventListener("click", async function () {

        if (loginBtn.disabled) {
            return;
        }

        setPiStatus("Connecting to Pi...");
        setPayStatus("Waiting for Pi authentication...");

        loginBtn.disabled = true;
        setPaymentEnabled(false);

        let loginTimeout = null;
        let timedOut = false;

        try {

            // Check SDK initialization.
            if (!piSdkReady) {
                throw piInitError || new Error(
                    "Pi SDK did not initialize. Check that Pi Browser can load the Pi SDK."
                );
            }

            if (
                !window.Pi ||
                typeof window.Pi.authenticate !== "function"
            ) {
                throw new Error(
                    "Pi.authenticate is unavailable. The Pi SDK did not load correctly."
                );
            }

            console.log(
                "[PConnect] Starting Pi authentication."
            );

            const scopes = [
                "username",
                "payments"
            ];

            // Timeout for diagnosis.
            const timeoutPromise = new Promise(
                function (_, reject) {
                    loginTimeout = setTimeout(
                        function () {
                            timedOut = true;

                            reject(new Error(
                                "Pi authentication timed out after 15 seconds. The Pi sign-in window opened, but the authentication result did not return."
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

            // Validate returned user.
            if (
                !authResult ||
                !authResult.user ||
                !authResult.user.username
            ) {
                throw new Error(
                    "Pi authentication returned no username. Please try signing in again."
                );
            }

            if (!authResult.accessToken) {
                throw new Error(
                    "Pi returned a username but no access token. Authentication could not be completed."
                );
            }

            // Keep token in memory only.
            currentPiUsername =
                authResult.user.username;

            currentPiAccessToken =
                authResult.accessToken;

            // Username only; never store access token here.
            sessionStorage.setItem(
                "pconnect_pi_username",
                currentPiUsername
            );

            setPiStatus(
                "Connected ✔️ " + currentPiUsername
            );

            setPayStatus(
                "Pi connected successfully. You can now make the 0.01 π Test-Pi payment."
            );

            setPaymentEnabled(true);

            console.log(
                "[PConnect] Pi authentication successful for:",
                currentPiUsername
            );

            // Refresh page data if these functions exist.
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

        } catch (error) {

            if (loginTimeout) {
                clearTimeout(loginTimeout);
                loginTimeout = null;
            }

            const message = getErrorMessage(error);

            console.error(
                "[PConnect] Login failed:",
                error
            );

            // Clear the failed login state.
            currentPiUsername = null;
            currentPiAccessToken = "";

            sessionStorage.removeItem(
                "pconnect_pi_username"
            );

            setPaymentEnabled(false);

            // Show the actual error for diagnosis.
            setPiStatus(
                "Login failed: " + message
            );

            setPayStatus(
                timedOut
                    ? "Pi sign-in did not return a result. Please retry in Pi Browser."
                    : "Pi login error: " + message
            );

        } finally {

            loginBtn.disabled = false;

        }

    });

}


// ==========================================
// INCOMPLETE PAYMENT CALLBACK
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

    const txid =
        payment.transaction &&
        payment.transaction.txid;

    if (!txid) {
        console.log(
            "[PConnect] Incomplete payment has no transaction ID yet."
        );
        return;
    }

    fetch("/api/complete", {

        method: "POST",

        headers: piJsonHeaders(),

        body: JSON.stringify({
            paymentId: payment.identifier,
            txid: txid,
            pi_username: currentPiUsername,
            service: currentService,
            request_id: currentRequestId
        })

    })

    .then(async function (response) {

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Could not complete the incomplete payment."
            );
        }

        return data;

    })

    .then(function (data) {

        console.log(
            "[PConnect] Incomplete payment handled:",
            data
        );

    })

    .catch(function (error) {

        console.error(
            "[PConnect] Incomplete payment handling failed:",
            error
        );

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
                "Pi SDK is unavailable. Please reload PConnect in Pi Browser."
            );
            return;
        }

        if (!currentPiUsername || !currentPiAccessToken) {
            setPayStatus(
                "Please sign in with Pi first."
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
        loginBtn.disabled = true;

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
                            loginBtn.disabled = false;

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
                            loginBtn.disabled = false;

                            if (
                                typeof window.loadTransactions === "function"
                            ) {
                                window.loadTransactions();
                            }

                            if (
                                typeof window.loadDashboard === "function"
                            ) {
                                window.loadDashboard();
                            }

                            if (
                                typeof window.loadNotifications === "function"
                            ) {
                                window.loadNotifications();
                            }

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
                            loginBtn.disabled = false;

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
                        loginBtn.disabled = false;

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
                        loginBtn.disabled = false;

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
            loginBtn.disabled = false;

        }

    });

}


// ==========================================
// END
// ==========================================

console.log("[PConnect] app.js loaded.");
