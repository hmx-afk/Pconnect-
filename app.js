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

const loginBtn =
    document.getElementById("loginBtn");

const status =
    document.getElementById("piStatus");

const payBtn =
    document.getElementById("payBtn");

const payStatus =
    document.getElementById("payStatus");


// ==========================================
// STORE LOGGED-IN PI USER
// ==========================================

let currentPiUsername = null;


// ==========================================
// REQUEST ID
// ==========================================

const urlParams =
    new URLSearchParams(
        window.location.search
    );

const urlRequestId =
    urlParams.get("request_id");


// Save request ID from URL
if (urlRequestId) {

    sessionStorage.setItem(
        "pconnect_request_id",
        urlRequestId
    );

}


// Use URL request ID or saved request ID
const currentRequestId =
    urlRequestId ||
    sessionStorage.getItem(
        "pconnect_request_id"
    );


// ==========================================
// SERVICE
// ==========================================

const currentService =
    "Web Development";


// ==========================================
// DEBUG
// ==========================================

console.log(
    "PConnect Request ID:",
    currentRequestId
);

console.log(
    "PConnect Service:",
    currentService
);


// ==========================================
// CHECK REQUIRED ELEMENTS
// ==========================================

if (!loginBtn) {

    console.error(
        "PConnect error: loginBtn not found."
    );

}

if (!status) {

    console.error(
        "PConnect error: piStatus not found."
    );

}

if (!payBtn) {

    console.error(
        "PConnect error: payBtn not found."
    );

}

if (!payStatus) {

    console.error(
        "PConnect error: payStatus not found."
    );

}


// ==========================================
// LOGIN
// ==========================================

if (loginBtn) {

    loginBtn.addEventListener(
        "click",
        async () => {

            if (status) {

                status.textContent =
                    "Connecting...";

            }

            if (payStatus) {

                payStatus.textContent =
                    "Connecting to Pi...";

            }

            loginBtn.disabled =
                true;

            if (payBtn) {

                payBtn.disabled =
                    true;

            }

            let loginTimeout;


            try {

                const scopes = [
                    "username",
                    "payments"
                ];


                // ==================================
                // AUTHENTICATION TIMEOUT
                // ==================================

                const timeoutPromise =
                    new Promise(
                        (_, reject) => {

                            loginTimeout =
                                setTimeout(
                                    () => {

                                        reject(
                                            new Error(
                                                "Pi SDK authentication timeout"
                                            )
                                        );

                                    },
                                    15000
                                );

                        }
                    );


                // ==================================
                // PI AUTHENTICATION
                // ==================================

                const authPromise =
                    Pi.authenticate(
                        scopes,
                        onIncompletePaymentFound
                    );


                const authResult =
                    await Promise.race([
                        authPromise,
                        timeoutPromise
                    ]);


                clearTimeout(
                    loginTimeout
                );


                // ==================================
                // CHECK AUTH RESULT
                // ==================================

                if (
                    !authResult ||
                    !authResult.user ||
                    !authResult.user.username
                ) {

                    throw new Error(
                        "Pi authentication returned no user"
                    );

                }


                console.log(
                    "Pi user:",
                    authResult.user
                );


                // ==================================
                // SAVE USERNAME
                // ==================================

                currentPiUsername =
                    authResult.user.username;


                // ==================================
                // SAVE USERNAME FOR PCONNECT
                // ==================================

                sessionStorage.setItem(
                    "pconnect_pi_username",
                    currentPiUsername
                );


                // ==================================
                // UPDATE ACCOUNT UI
                // ==================================

                if (status) {

                    status.textContent =
                        "Connected ✔️ " +
                        currentPiUsername;

                }


                // ==================================
                // ENABLE PAYMENT
                // ==================================

                if (payBtn) {

                    payBtn.disabled =
                        false;

                }


                if (payStatus) {

                    payStatus.textContent =
                        "Pi connected successfully. You can now make the 0.01 π Test-Pi payment.";

                }


                // ==================================
                // REFRESH TRANSACTION HISTORY
                // AFTER PI LOGIN
                // ==================================

                if (
                    typeof loadTransactions ===
                    "function"
                ) {

                    loadTransactions();

                }


                // ==================================
                // REFRESH NOTIFICATIONS
                // ==================================

                if (
                    typeof loadNotifications ===
                    "function"
                ) {

                    loadNotifications();

                }


                console.log(
                    "Pi authentication successful:",
                    currentPiUsername
                );


            } catch (error) {

                clearTimeout(
                    loginTimeout
                );


                console.error(
                    "Login error:",
                    error
                );


                if (
                    error.message ===
                    "Pi SDK authentication timeout"
                ) {

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

                        payStatus.textContent =
                            "Unable to connect to Pi.";

                    }

                }


                if (payBtn) {

                    payBtn.disabled =
                        true;

                }

            } finally {

                loginBtn.disabled =
                    false;

            }

        }
    );

}


// ==========================================
// INCOMPLETE PAYMENT
// ==========================================

function onIncompletePaymentFound(
    payment
) {

    console.log(
        "Incomplete payment:",
        payment
    );


    if (
        !payment ||
        !payment.identifier
    ) {

        return;

    }


    const txid =
        payment.transaction?.txid;


    if (!txid) {

        console.log(
            "Incomplete payment found, but txid is not available yet."
        );

        return;

    }


    fetch(
        "/api/complete",
        {

            method: "POST",

            headers: {

                "Content-Type":
                    "application/json"

            },

            body: JSON.stringify({

                paymentId:
                    payment.identifier,

                txid:
                    txid,

                pi_username:
                    currentPiUsername,

                service:
                    currentService,

                request_id:
                    currentRequestId

            })

        }
    )

        .then(
            res =>
                res.json()
        )

        .then(
            data => {

                console.log(
                    "Incomplete payment handled:",
                    data
                );

            }
        )

        .catch(
            error => {

                console.error(
                    "Incomplete payment cleanup failed:",
                    error
                );

            }
        );

}


// ==========================================
// PAYMENT
// ==========================================

if (payBtn) {

    payBtn.addEventListener(
        "click",
        () => {

            const amount =
                0.01;


            // ==================================
            // AMOUNT CHECK
            // ==================================

            if (
                typeof amount !== "number" ||
                amount <= 0
            ) {

                payStatus.textContent =
                    "Invalid payment amount.";

                return;

            }


            // ==================================
            // LOGIN CHECK
            // ==================================

            if (!currentPiUsername) {

                payStatus.textContent =
                    "Please sign in with Pi first.";

                return;

            }


            // ==================================
            // REQUEST ID CHECK
            // ==================================

            if (!currentRequestId) {

                payStatus.textContent =
                    "⚠️ No approved request found. Please open the payment from My Requests.";

                console.error(
                    "Missing PConnect request_id"
                );

                return;

            }


            // ==================================
            // PAYMENT START
            // ==================================

            payBtn.disabled =
                true;


            loginBtn.disabled =
                true;


            payStatus.textContent =
                "Processing 0.01 π Test-Pi payment...";


            console.log(
                "Starting payment..."
            );


            console.log(
                "Request ID:",
                currentRequestId
            );


            console.log(
                "Pi username:",
                currentPiUsername
            );


            // ==================================
            // CREATE PAYMENT
            // ==================================

            Pi.createPayment(

                {

                    amount:
                        amount,

                    memo:
                        "Payment for PConnect service",

                    metadata: {

                        request_id:
                            currentRequestId,

                        service:
                            currentService,

                        test:
                            true

                    }

                },


                {

                    // ==================================
                    // SERVER APPROVAL
                    // ==================================

                    onReadyForServerApproval:
                        function (
                            paymentId
                        ) {

                            console.log(
                                "Ready for server approval:",
                                paymentId
                            );


                            fetch(
                                "/api/approve",
                                {

                                    method: "POST",

                                    headers: {

                                        "Content-Type":
                                            "application/json"

                                    },

                                    body: JSON.stringify({

                                        paymentId:
                                            paymentId

                                    })

                                }
                            )

                                .then(
                                    async res => {

                                        const data =
                                            await res.json();

                                        if (
                                            !res.ok
                                        ) {

                                            throw new Error(
                                                data.error ||
                                                "Payment approval failed"
                                            );

                                        }

                                        return data;

                                    }
                                )

                                .then(
                                    data => {

                                        console.log(
                                            "Approval response:",
                                            data
                                        );


                                        payStatus.textContent =
                                            "Payment approved. Waiting for Pi transaction...";

                                    }
                                )

                                .catch(
                                    error => {

                                        console.error(
                                            "Approval error:",
                                            error
                                        );


                                        payStatus.textContent =
                                            "Payment could not be approved.";


                                        payBtn.disabled =
                                            false;


                                        loginBtn.disabled =
                                            false;

                                    }
                                );

                        },


                    // ==================================
                    // SERVER COMPLETION
                    // ==================================

                    onReadyForServerCompletion:
                        function (
                            paymentId,
                            txid
                        ) {

                            console.log(
                                "Ready for server completion:"
                            );


                            console.log(
                                "Payment ID:",
                                paymentId
                            );


                            console.log(
                                "TXID:",
                                txid
                            );


                            payStatus.textContent =
                                "Completing payment and saving transaction...";


                            fetch(
                                "/api/complete",
                                {

                                    method: "POST",

                                    headers: {

                                        "Content-Type":
                                            "application/json"

                                    },

                                    body: JSON.stringify({

                                        paymentId:
                                            paymentId,

                                        txid:
                                            txid,

                                        pi_username:
                                            currentPiUsername,

                                        service:
                                            currentService,

                                        request_id:
                                            currentRequestId

                                    })

                                }
                            )

                                .then(
                                    async res => {

                                        const data =
                                            await res.json();

                                        if (
                                            !res.ok
                                        ) {

                                            throw new Error(
                                                data.error ||
                                                "Payment completion failed"
                                            );

                                        }

                                        return data;

                                    }
                                )

                                .then(
                                    data => {

                                        console.log(
                                            "Completion response:",
                                            data
                                        );


                                        payStatus.textContent =
                                            "✔️ Payment complete! Request #" +
                                            currentRequestId +
                                            " has been linked to this transaction.";


                                        payBtn.disabled =
                                            false;


                                        loginBtn.disabled =
                                            false;


                                        // ==================================
                                        // REFRESH TRANSACTION HISTORY
                                        // ==================================

                                        if (
                                            typeof loadTransactions ===
                                            "function"
                                        ) {

                                            loadTransactions();

                                        }


                                        // ==================================
                                        // REFRESH DASHBOARD
                                        // ==================================

                                        if (
                                            typeof loadDashboard ===
                                            "function"
                                        ) {

                                            loadDashboard();

                                        }


                                        // ==================================
                                        // REFRESH NOTIFICATIONS
                                        // ==================================

                                        if (
                                            typeof loadNotifications ===
                                            "function"
                                        ) {

                                            loadNotifications();

                                        }

                                    }
                                )

                                .catch(
                                    error => {

                                        console.error(
                                            "Completion error:",
                                            error
                                        );


                                        payStatus.textContent =
                                            "Payment could not be completed: " +
                                            error.message;


                                        payBtn.disabled =
                                            false;


                                        loginBtn.disabled =
                                            false;

                                    }
                                );

                        },


                    // ==================================
                    // PAYMENT CANCELLED
                    // ==================================

                    onCancel:
                        function (
                            paymentId
                        ) {

                            console.log(
                                "Payment cancelled:",
                                paymentId
                            );


                            payStatus.textContent =
                                "Payment cancelled.";


                            payBtn.disabled =
                                false;


                            loginBtn.disabled =
                                false;

                        },


                    // ==================================
                    // PAYMENT ERROR
                    // ==================================

                    onError:
                        function (
                            error,
                            payment
                        ) {

                            console.error(
                                "Payment error:",
                                error,
                                payment
                            );


                            payStatus.textContent =
                                "Something went wrong with the payment.";


                            payBtn.disabled =
                                false;


                            loginBtn.disabled =
                                false;

                        }

                }

            );

        }
    );

}
