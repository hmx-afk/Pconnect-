// Initialize Pi SDK for Testnet
Pi.init({
    version: "2.0",
    sandbox: false
});

const loginBtn = document.getElementById("loginBtn");
const status = document.getElementById("status");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");

loginBtn.addEventListener("click", async () => {
    status.textContent = "Connecting...";

    try {
        const scopes = ["username", "payments"];

        const authResult = await Pi.authenticate(
            scopes,
            onIncompletePaymentFound
        );

        console.log("User:", authResult.user);

        status.textContent =
            "Connected ✔️ " + authResult.user.username;

        payBtn.style.display = "inline-block";

    } catch (error) {
        console.error(error);
        status.textContent =
            "Connection failed: " + JSON.stringify(error) + " | " + error.message;
    }

    setTimeout(() => {
        if (status.textContent === "Connecting...") {
            status.textContent = "⚠️ Timeout - babu amsa daga Pi SDK bayan 15s";
        }
    }, 15000);
});

function onIncompletePaymentFound(payment) {
    console.log("Incomplete payment:", payment);
    fetch("/api/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            paymentId: payment.identifier,
            txid: payment.transaction ? payment.transaction.txid : null
        })
    });
}

payBtn.addEventListener("click", () => {
    payStatus.textContent = "Processing payment...";

    Pi.createPayment({
        amount: 0.01,
        memo: "Test payment for PiConnect",
        metadata: { test: true }
    }, {
        onReadyForServerApproval: function (paymentId) {
            fetch("/api/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentId })
            });
        },
        onReadyForServerCompletion: function (paymentId, txid) {
            fetch("/api/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentId, txid })
            }).then(() => {
                payStatus.textContent = "✔️ Payment complete!";
            });
        },
        onCancel: function (paymentId) {
            payStatus.textContent = "Payment cancelled.";
        },
        onError: function (error, payment) {
            payStatus.textContent = "Payment error: " + error.message;
        }
    });
});
