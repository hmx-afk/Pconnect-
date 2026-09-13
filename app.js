// Initialize Pi SDK for Production
Pi.init({
    version: "2.0",
    sandbox: true
});

const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("status");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");

let accessToken = null;

// -------------------------
// Pi Authentication
// -------------------------
loginBtn.addEventListener("click", async () => {
    status.textContent = "Connecting...";
    loginBtn.disabled = true;

    try {
        const scopes = ["username", "payments"];

        const authResult = await Pi.authenticate(
            scopes,
            onIncompletePaymentFound
        );

        console.log("User:", authResult.user);

        // Keep the access token for authenticated backend requests
        accessToken = authResult.accessToken;

        status.textContent =
            "Connected ✔️ " + authResult.user.username;

        // Enable payment button
        payBtn.disabled = false;

    } catch (error) {
        console.error("Authentication error:", error);

        status.textContent =
            "Connection failed: " +
            (error.message || JSON.stringify(error));

        loginBtn.disabled = false;
    }
});

// -------------------------
// Handle incomplete payment
// -------------------------
async function onIncompletePaymentFound(payment) {
    console.log("Incomplete payment:", payment);

    // We only attempt completion when Pi gives us a real txid.
    if (!payment.transaction || !payment.transaction.txid) {
        console.log("Incomplete payment has no txid yet.");
        return;
    }

    try {
        const response = await fetch("/api/complete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                paymentId: payment.identifier,
                txid: payment.transaction.txid
            })
        });

        const data = await response.json();

        console.log("Incomplete payment completion:", data);

    } catch (error) {
        console.error(
            "Incomplete payment completion error:",
            error
        );
    }
}

// -------------------------
// Create Pi Payment
// -------------------------
payBtn.addEventListener("click", () => {

    payStatus.textContent = "Starting payment...";
    payBtn.disabled = true;

    Pi.createPayment(
        {
            amount: 0.01,
            memo: "Test payment for PConnect",
            metadata: {
                purpose: "test_payment"
            }
        },
        {

            // -------------------------
            // Server Approval
            // -------------------------
            onReadyForServerApproval: async (paymentId) => {

                console.log(
                    "Payment ready for approval:",
                    paymentId
                );

                payStatus.textContent =
                    "Waiting for server approval...";

                try {
                    const response = await fetch(
                        "/api/approve",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization":
                                    `Bearer ${accessToken}`
                            },
                            body: JSON.stringify({
                                paymentId
                            })
                        }
                    );

                    const data = await response.json();

                    console.log(
                        "Approval response:",
                        data
                    );

                    if (!response.ok) {
                        throw new Error(
                            data.error ||
                            data.message ||
                            "Payment approval failed"
                        );
                    }

                    payStatus.textContent =
                        "✔️ Payment approved. Continue in Pi Wallet.";

                } catch (error) {

                    console.error(
                        "Approval error:",
                        error
                    );

                    payStatus.textContent =
                        "❌ Approval failed: " +
                        error.message;

                    payBtn.disabled = false;
                }
            },

            // -------------------------
            // Server Completion
            // -------------------------
            onReadyForServerCompletion: async (
                paymentId,
                txid
            ) => {

                console.log(
                    "Payment ready for completion:",
                    paymentId,
                    txid
                );

                payStatus.textContent =
                    "Completing payment...";

                try {
                    const response = await fetch(
                        "/api/complete",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization":
                                    `Bearer ${accessToken}`
                            },
                            body: JSON.stringify({
                                paymentId,
                                txid
                            })
                        }
                    );

                    const data = await response.json();

                    console.log(
                        "Completion response:",
                        data
                    );

                    if (!response.ok) {
                        throw new Error(
                            data.error ||
                            data.message ||
                            "Payment completion failed"
                        );
                    }

                    payStatus.textContent =
                        "✔️ Payment complete!";

                } catch (error) {

                    console.error(
                        "Completion error:",
                        error
                    );

                    payStatus.textContent =
                        "❌ Completion failed: " +
                        error.message;

                } finally {
                    payBtn.disabled = false;
                }
            },

            // -------------------------
            // Cancel
            // -------------------------
            onCancel: (paymentId) => {

                console.log(
                    "Payment cancelled:",
                    paymentId
                );

                payStatus.textContent =
                    "Payment cancelled.";

                payBtn.disabled = false;
            },

            // -------------------------
            // Error
            // -------------------------
            onError: (error, payment) => {

                console.error(
                    "Pi payment error:",
                    error,
                    payment
                );

                payStatus.textContent =
                    "❌ Payment error: " +
                    (error.message ||
                    JSON.stringify(error));

                payBtn.disabled = false;
            }
        }
    );
});
