// ==========================================
// PConnect - Pi SDK Testnet
// ==========================================

Pi.init({
    version: "2.0",
    sandbox: true
});

const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("status");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");


// ==========================================
// LOGIN
// ==========================================

loginBtn.addEventListener("click", async () => {
    status.textContent = "Connecting...";
    loginBtn.disabled = true;

    let loginTimeout;

    try {
        const scopes = ["username", "payments"];

        const timeoutPromise = new Promise((_, reject) => {
            loginTimeout = setTimeout(() => {
                reject(new Error("Pi SDK authentication timeout"));
            }, 15000);
        });

        const authPromise = Pi.authenticate(
            scopes,
            onIncompletePaymentFound
        );

        const authResult = await Promise.race([
            authPromise,
            timeoutPromise
        ]);

        clearTimeout(loginTimeout);

        console.log("User:", authResult.user);

        status.textContent =
            "Connected ✔️ " + authResult.user.username;

        payBtn.disabled = false;

    } catch (error) {
        clearTimeout(loginTimeout);

        console.error("Login error:", error);

        if (error.message === "Pi SDK authentication timeout") {
            status.textContent =
                "⚠️ Timeout - no response from Pi SDK after 15s";
        } else {
            status.textContent =
                "Connection failed. Please try again.";
        }

    } finally {
        loginBtn.disabled = false;
    }
});


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
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            paymentId: payment.identifier,
            txid: txid
        })
    })
        .then(res => res.json())
        .then(data => {
            console.log("Incomplete payment handled:", data);
        })
        .catch(err => {
            console.error(
                "Incomplete payment cleanup failed:",
                err
            );
        });
}


// ==========================================
// PAYMENT
// ==========================================

payBtn.addEventListener("click", () => {

    const amount = 0.01;

    if (typeof amount !== "number" || amount <= 0) {
        payStatus.textContent =
            "Invalid payment amount.";
        return;
    }

    payBtn.disabled = true;

    payStatus.textContent =
        "Processing payment...";


    Pi.createPayment(
        {
            amount: amount,
            memo: "Test payment for PiConnect",
            metadata: {
                test: true
            }
        },

        {

            // ==================================
            // SERVER APPROVAL
            // ==================================

            onReadyForServerApproval: function (paymentId) {

                console.log(
                    "Ready for approval:",
                    paymentId
                );

                fetch("/api/approve", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        paymentId: paymentId
                    })
                })
                    .then(res => res.json())
                    .then(data => {

                        console.log(
                            "Approval response:",
                            data
                        );

                        if (data.error) {

                            console.error(
                                "Approve error:",
                                data.error
                            );

                            payStatus.textContent =
                                "Payment could not be approved.";

                            payBtn.disabled = false;
                        }
                    })
                    .catch(err => {

                        console.error(
                            "Approval network error:",
                            err
                        );

                        payStatus.textContent =
                            "Network error during approval.";

                        payBtn.disabled = false;
                    });
            },


            // ==================================
            // SERVER COMPLETION
            // ==================================

            onReadyForServerCompletion:
                function (paymentId, txid) {

                    console.log(
                        "Ready for completion:",
                        paymentId,
                        txid
                    );

                    fetch("/api/complete", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            paymentId: paymentId,
                            txid: txid
                        })
                    })
                        .then(res => res.json())
                        .then(data => {

                            console.log(
                                "Completion response:",
                                data
                            );

                            if (data.error) {

                                console.error(
                                    "Complete error:",
                                    data.error
                                );

                                payStatus.textContent =
                                    "Payment could not be completed.";

                                payBtn.disabled = false;

                                return;
                            }

                            payStatus.textContent =
                                "✔️ Payment complete!";

                            payBtn.disabled = false;
                        })
                        .catch(err => {

                            console.error(
                                "Completion network error:",
                                err
                            );

                            payStatus.textContent =
                                "Network error during completion.";

                            payBtn.disabled = false;
                        });
                },


            // ==================================
            // CANCEL
            // ==================================

            onCancel: function (paymentId) {

                console.log(
                    "Payment cancelled:",
                    paymentId
                );

                payStatus.textContent =
                    "Payment cancelled.";

                payBtn.disabled = false;
            },


            // ==================================
            // ERROR
            // ==================================

            onError: function (error, payment) {

                console.error(
                    "Payment error:",
                    error,
                    payment
                );

                payStatus.textContent =
                    "Something went wrong with the payment.";

                payBtn.disabled = false;
            }
        }
    );
});
