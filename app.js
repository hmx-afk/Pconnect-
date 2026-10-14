// ==========================================
// PConnect - Pi SDK Testnet
// ==========================================

Pi.init({
    version: "2.0",
    sandbox: true
});


// ==========================================
// DOM ELEMENTS
// ==========================================

const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("piStatus");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");


// ==========================================
// LOGGED-IN PI USER (token is kept in memory only)
// ==========================================

let currentPiUsername = null;
let currentPiAccessToken = "";


// ==========================================
// REQUEST ID
// ==========================================

const urlParams = new URLSearchParams(window.location.search);
const urlRequestId = urlParams.get("request_id");

if (urlRequestId) {
    sessionStorage.setItem("pconnect_request_id", urlRequestId);
}

const currentRequestId =
    urlRequestId ||
    sessionStorage.getItem("pconnect_request_id");


// ==========================================
// SERVICE
// ==========================================

const currentService = "Web Development";


// ==========================================
// DEBUG
// ==========================================

console.log("PConnect Request ID:", currentRequestId);
console.log("PConnect Service:", currentService);


// ==========================================
// CHECK REQUIRED ELEMENTS
// ==========================================

if (!loginBtn) {
    console.error("PConnect error: loginBtn not found.");
}

if (!status) {
    console.error("PConnect error: piStatus not found.");
}

if (!payBtn) {
    console.error("PConnect error: payBtn not found.");
}

if (!payStatus) {
    console.error("PConnect error: payStatus not found.");
}


// ==========================================
// HEADERS WITH PI ACCESS TOKEN
// ==========================================

function piJsonHeaders() {
    const headers = {
        "Content-Type": "application/json"
    };

    if (currentPiAccessToken) {
        headers["Authorization"] = "Bearer " + currentPiAccessToken;
    }

    return headers;
}


// ==========================================
// LOGIN
// ==========================================

if (loginBtn) {

    loginBtn.addEventListener("click", async () => {

        if (status) {
            status.textContent = "Connecting...";
        }

        if (payStatus) {
            payStatus.textContent = "Connecting to Pi...";
        }

        loginBtn.disabled = true;

        if (payBtn) {
            payBtn.disabled = true;
        }

        let loginTimeout;

        try {

            const scopes = ["username", "payments"];

            // Authentication timeout
            const timeoutPromise = new Promise((_, reject) => {
                loginTimeout = setTimeout(() => {
                    reject(new Error("Pi SDK authentication timeout"));
                }, 15000);
            });

            // Pi authentication
            const authPromise = Pi.authenticate(
                scopes,
                onIncompletePaymentFound
            );

            const authResult = await Promise.race([
                authPromise,
                timeoutPromise
            ]);

            clearTimeout(loginTimeout);

            // Check auth result
            if (
                !authResult ||
                !authResult.user ||
                !authResult.user.username
            ) {
                throw new Error("Pi authentication returned no user");
            }

            console.log("Pi user:", authResult.user);

            // Save user (token stays in memory only)
            currentPiUsername = authResult.user.username;
            currentPiAccessToken = authResult.accessToken || "";

            sessionStorage.setItem(
                "pconnect_pi_username",
                currentPiUsername
            );

            // Update account UI
            if (status) {
                status.textContent = "Connected ✔️ " + currentPiUsername;
            }

            // Enable payment
            if (payBtn) {
                payBtn.disabled = false;
            }

            if (payStatus) {
                payStatus.textContent =
                    "Pi connected successfully. You can now make the 0.01 π Test-Pi payment.";
            }

            // Refresh transaction history after Pi login
            if (typeof loadTransactions === "function") {
                loadTransactions();
            }

            // Refresh notifications
            if (typeof loadNotifications === "function") {
                loadNotifications();
            }

            console.log(
                "Pi authentication successful:",
                currentPiUsername
            );

        } catch (error) {

            clearTimeout(loginTimeout);

            console.error("Login error:", error);

            if (error.message === "Pi SDK authentication timeout") {

                if (status) {
                    status.textContent =
                        "⚠️ Timeout - no response from Pi SDK after 15s";
                }

                if (payStatus) {
                    payStatus.textContent =
                        "Pi connection timed out. Please try again.";
                }

            } else {

                if (status) {
                    status.textContent =
                        "Connection failed. Please try again.";
                }

                if (payStatus) {
                    payStatus.textContent = "Unable to connect to Pi.";
                }

            }

            if (payBtn) {
                payBtn.disabled = true;
            }

        } finally {

            loginBtn.disabled = false;

        }

    });

}


// ==========================================
// INCOMPLETE PAYMENT
// ==========================================

function onIncompletePaymentFound(payment) {

    console.log("Incomplete payment:", payment);

    if (!payment || !payment.identifier) {
        return;
    }

    const txid = payment.transaction?.txid;

    if (!txid) {
        console.log(
            "Incomplete payment found, but txid is not available yet."
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

        .then(res => res.json())

        .then(data => {
            console.log("Incomplete payment handled:", data);
        })

        .catch(error => {
            console.error("Incomplete payment cleanup failed:", error);
        });

}


// ==========================================
// PAYMENT
// ==========================================

if (payBtn) {

    payBtn.addEventListener("click", () => {

        const amount = 0.01;

        // Amount check
        if (typeof amount !== "number" || amount <= 0) {
            payStatus.textContent = "Invalid payment amount.";
            return;
        }

        // Login check
        if (!currentPiUsername) {
            payStatus.textContent = "Please sign in with Pi first.";
            return;
        }

        // Request ID check
        if (!currentRequestId) {

            payStatus.textContent =
                "⚠️ No approved request found. Please open the payment from My Requests.";

            console.error("Missing PConnect request_id");

            return;
        }

        // Payment start
        payBtn.disabled = true;
        loginBtn.disabled = true;

        payStatus.textContent = "Processing 0.01 π Test-Pi payment...";

        console.log("Starting payment...");
        console.log("Request ID:", currentRequestId);
        console.log("Pi username:", currentPiUsername);

        // Create payment
        Pi.createPayment(

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

                // Server approval
                onReadyForServerApproval: function (paymentId) {

                    console.log("Ready for server approval:", paymentId);

                    fetch("/api/approve", {

                        method: "POST",

                        headers: piJsonHeaders(),

                        body: JSON.stringify({
                            paymentId: paymentId
                        })

                    })

                        .then(async res => {

                            const data = await res.json();

                            if (!res.ok) {
                                throw new Error(
                                    data.error ||
                                    "Payment approval failed"
                                );
                            }

                            return data;

                        })

                        .then(data => {

                            console.log("Approval response:", data);

                            payStatus.textContent =
                                "Payment approved. Waiting for Pi transaction...";

                        })

                        .catch(error => {

                            console.error("Approval error:", error);

                            payStatus.textContent =
                                "Payment could not be approved.";

                            payBtn.disabled = false;
                            loginBtn.disabled = false;

                        });

                },

                // Server completion
                onReadyForServerCompletion: function (paymentId, txid) {

                    console.log("Ready for server completion:");
                    console.log("Payment ID:", paymentId);
                    console.log("TXID:", txid);

                    payStatus.textContent =
                        "Completing payment and saving transaction...";

                    fetch("/api/complete", {

                        method: "POST",

                        headers: piJsonHeaders(),

                        body: JSON.stringify({
                            paymentId: paymentId,
                            txid: txid,
                            pi_username: currentPiUsername,
                            service: currentService,
                            request_id: currentRequestId
                        })

                    })

                        .then(async res => {

                            const data = await res.json();

                            if (!res.ok) {
                                throw new Error(
                                    data.error ||
                                    "Payment completion failed"
                                );
                            }

                            return data;

                        })

                        .then(data => {

                            console.log("Completion response:", data);

                            payStatus.textContent =
                                "✔️ Payment complete! Request #" +
                                currentRequestId +
                                " has been linked to this transaction.";

                            payBtn.disabled = false;
                            loginBtn.disabled = false;

                            // Refresh transaction history
                            if (typeof loadTransactions === "function") {
                                loadTransactions();
                            }

                            // Refresh dashboard
                            if (typeof loadDashboard === "function") {
                                loadDashboard();
                            }

                            // Refresh notifications
                            if (typeof loadNotifications === "function") {
                                loadNotifications();
                            }

                        })

                        .catch(error => {

                            console.error("Completion error:", error);

                            payStatus.textContent =
                                "Payment could not be completed: " +
                                error.message;

                            payBtn.disabled = false;
                            loginBtn.disabled = false;

                        });

                },

                // Payment cancelled
                onCancel: function (paymentId) {

                    console.log("Payment cancelled:", paymentId);

                    payStatus.textContent = "Payment cancelled.";

                    payBtn.disabled = false;
                    loginBtn.disabled = false;

                },

                // Payment error
                onError: function (error, payment) {

                    console.error("Payment error:", error, payment);

                    payStatus.textContent =
                        "Something went wrong with the payment.";

                    payBtn.disabled = false;
                    loginBtn.disabled = false;

                }

            }

        );

    });

}
