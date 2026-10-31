// ==========================================
// PConnect - Pi SDK Testnet
// Authentication + Payments
// Dashboard + Notifications + Transactions
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
// DATA CACHE
// ==========================================

let cachedRequests = [];
let cachedTransactions = [];
let cachedNotifications = [];

let transactionsLoaded = false;

// ==========================================
// INCOMPLETE PAYMENT RECOVERY
// ==========================================

let pendingIncompletePayment = null;
let processingIncompletePayment = false;

// ==========================================
// LOGIN CONTROL
// ==========================================

let loginInProgress = false;

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

function updatePaymentButton() {
    const canPay =
        Boolean(currentPiUsername) &&
        Boolean(currentPiAccessToken) &&
        !pendingIncompletePayment &&
        !processingIncompletePayment;

    setPaymentEnabled(canPay);
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

    return String(error);
}

// ==========================================
// API RESPONSE HELPER
// ==========================================

async function fetchPiApi(endpoint, options = {}) {
    if (!currentPiAccessToken) {
        throw new Error(
            "Please sign in with Pi first."
        );
    }

    const response = await fetch(endpoint, {
        ...options,

        headers: {
            ...piJsonHeaders(),
            ...(options.headers || {})
        },

        cache: "no-store"
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            "The server returned an invalid response."
        );
    }

    if (!response.ok || data.success !== true) {
        throw new Error(
            data.error || "Unable to load data."
        );
    }

    return data;
}

// ==========================================
// PAYMENT API HELPER
// ==========================================

async function sendPaymentApi(endpoint, body) {
    if (!currentPiAccessToken) {
        throw new Error(
            "Pi authentication is required."
        );
    }

    const response = await fetch(endpoint, {
        method: "POST",

        headers: piJsonHeaders(),

        body: JSON.stringify(body),

        cache: "no-store"
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            "The payment server returned an invalid response."
        );
    }

    if (!response.ok || data.success !== true) {
        throw new Error(
            data.error || "Payment operation failed."
        );
    }

    return data;
}

// ==========================================
// SAFE DOM HELPERS
// ==========================================

function getElement(id) {
    return document.getElementById(id);
}

function setElementText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = String(value);
    }
}

function createTextElement(tag, value, className) {
    const element = document.createElement(tag);

    element.textContent = String(value ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}

function formatDate(value) {
    if (!value) {
        return "Date unavailable";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleString();
}

// ==========================================
// LOAD TRANSACTIONS
// ==========================================

window.loadTransactions = async function () {
    const data = await fetchPiApi(
        "/api/transactions"
    );

    if (!Array.isArray(data.transactions)) {
        throw new Error(
            "Invalid transactions response."
        );
    }

    cachedTransactions = data.transactions;
    transactionsLoaded = true;

    const completedCount = cachedTransactions.filter(
        function (transaction) {
            return String(
                transaction.status || ""
            ).trim().toLowerCase() === "completed";
        }
    ).length;

    setElementText(
        "completedPayments",
        completedCount
    );

    const container =
        getElement("transactionsList") ||
        getElement("transactionList") ||
        getElement("transactionsContainer") ||
        getElement("transactionHistory");

    if (container) {
        container.replaceChildren();

        if (cachedTransactions.length === 0) {
            container.appendChild(
                createTextElement(
                    "p",
                    "No transactions found."
                )
            );

        } else {
            cachedTransactions.forEach(
                function (transaction) {
                    const item = document.createElement("div");

                    item.className = "transaction-item";

                    item.append(
                        createTextElement(
                            "strong",
                            transaction.service || "PConnect Service"
                        ),

                        createTextElement(
                            "p",
                            transaction.request_id
                                ? "Request #" + transaction.request_id
                                : "Request ID not linked"
                        ),

                        createTextElement(
                            "p",
                            String(transaction.amount ?? "0") +
                            " " +
                            String(transaction.currency || "Pi")
                        ),

                        createTextElement(
                            "p",
                            "Status: " +
                            String(transaction.status || "Unknown")
                        ),

                        createTextElement(
                            "small",
                            formatDate(transaction.created_at)
                        )
                    );

                    container.appendChild(item);
                }
            );
        }
    }

    console.log(
        "[PConnect] Transactions loaded:",
        cachedTransactions.length
    );

    return cachedTransactions;
};

// ==========================================
// LOAD DASHBOARD
// ==========================================

window.loadDashboard = async function () {
    const hasDashboard = [
        "totalRequests",
        "waitingRequests",
        "approvedRequests",
        "rejectedRequests",
        "completedPayments",
        "recentActivity"
    ].some(function (id) {
        return Boolean(getElement(id));
    });

    if (!hasDashboard) {
        return;
    }

    const data = await fetchPiApi(
        "/api/my-requests"
    );

    if (!Array.isArray(data.requests)) {
        throw new Error(
            "Invalid requests response."
        );
    }

    cachedRequests = data.requests;

    const total = cachedRequests.length;

    const waiting = cachedRequests.filter(
        function (request) {
            const value = String(
                request.review_status || ""
            ).trim().toLowerCase();

            return (
                value === "waiting for review" ||
                value === "waiting"
            );
        }
    ).length;

    const approved = cachedRequests.filter(
        function (request) {
            return String(
                request.review_status || ""
            ).trim().toLowerCase() === "approved";
        }
    ).length;

    const rejected = cachedRequests.filter(
        function (request) {
            return String(
                request.review_status || ""
            ).trim().toLowerCase() === "rejected";
        }
    ).length;

    setElementText("totalRequests", total);
    setElementText("waitingRequests", waiting);
    setElementText("approvedRequests", approved);
    setElementText("rejectedRequests", rejected);

    // Load transactions if necessary.

    try {
        if (!transactionsLoaded) {
            await window.loadTransactions();
        }

        const completedPayments =
            cachedTransactions.filter(
                function (transaction) {
                    return String(
                        transaction.status || ""
                    ).trim().toLowerCase() === "completed";
                }
            ).length;

        setElementText(
            "completedPayments",
            completedPayments
        );

    } catch (error) {
        console.error(
            "[PConnect] Completed payments count failed:",
            error
        );

        setElementText(
            "completedPayments",
            "—"
        );
    }

    // ======================================
    // RECENT ACTIVITY
    // ======================================

    const activityContainer = getElement(
        "recentActivity"
    );

    if (activityContainer) {
        activityContainer.replaceChildren();

        const recentRequests = [...cachedRequests]
            .sort(function (a, b) {
                return (
                    new Date(b.created_at || 0) -
                    new Date(a.created_at || 0)
                );
            })
            .slice(0, 5);

        if (recentRequests.length === 0) {
            activityContainer.appendChild(
                createTextElement(
                    "p",
                    "No recent activity found."
                )
            );

        } else {
            recentRequests.forEach(
                function (request) {
                    const item = document.createElement("div");

                    item.className = "activity-item";

                    item.append(
                        createTextElement(
                            "strong",
                            request.service || "Service Request"
                        ),

                        createTextElement(
                            "p",
                            "Request #" + String(request.id)
                        ),

                        createTextElement(
                            "p",
                            "Review: " +
                            String(
                                request.review_status || "Unknown"
                            )
                        ),

                        createTextElement(
                            "p",
                            "Order: " +
                            String(
                                request.order_status || "Unknown"
                            )
                        ),

                        createTextElement(
                            "small",
                            formatDate(request.created_at)
                        )
                    );

                    activityContainer.appendChild(item);
                }
            );
        }
    }

    console.log(
        "[PConnect] Dashboard loaded:",
        {
            total,
            waiting,
            approved,
            rejected
        }
    );

    return cachedRequests;
};

// ==========================================
// MARK NOTIFICATION AS READ
// ==========================================

async function markNotificationAsRead(id) {
    const notificationId = Number(id);

    if (
        !Number.isSafeInteger(notificationId) ||
        notificationId <= 0
    ) {
        throw new Error(
            "Invalid notification ID."
        );
    }

    const data = await fetchPiApi(
        "/api/notifications",
        {
            method: "PATCH",

            body: JSON.stringify({
                id: notificationId
            })
        }
    );

    if (!data.notification) {
        throw new Error(
            "Notification update was not confirmed."
        );
    }

    return data.notification;
}

// ==========================================
// LOAD NOTIFICATIONS
// ==========================================

window.loadNotifications = async function () {
    const data = await fetchPiApi(
        "/api/notifications"
    );

    if (!Array.isArray(data.notifications)) {
        throw new Error(
            "Invalid notifications response."
        );
    }

    cachedNotifications = data.notifications;

    const unreadCount = cachedNotifications.filter(
        function (notification) {
            return notification.is_read === false;
        }
    ).length;

    // NOTIFICATION BADGE

    const badge = getElement(
        "notificationBadge"
    );

    if (badge) {
        badge.textContent = String(unreadCount);
        badge.hidden = unreadCount === 0;
    }

    // NOTIFICATION LIST

    const container = getElement(
        "notificationsList"
    );

    if (container) {
        container.replaceChildren();

        if (cachedNotifications.length === 0) {
            container.appendChild(
                createTextElement(
                    "p",
                    "No notifications found."
                )
            );

        } else {
            cachedNotifications.forEach(
                function (notification) {
                    const item = document.createElement("div");

                    const unread =
                        notification.is_read === false;

                    item.className = unread
                        ? "notification-item unread"
                        : "notification-item";

                    item.append(
                        createTextElement(
                            "strong",
                            notification.title || "Notification"
                        ),

                        createTextElement(
                            "p",
                            notification.message || ""
                        ),

                        createTextElement(
                            "small",
                            formatDate(notification.created_at)
                        )
                    );

                    if (unread) {
                        const readButton =
                            createTextElement(
                                "button",
                                "Mark as read"
                            );

                        readButton.type = "button";

                        readButton.addEventListener(
                            "click",
                            async function () {
                                readButton.disabled = true;

                                try {
                                    await markNotificationAsRead(
                                        notification.id
                                    );

                                    notification.is_read = true;

                                    await window.loadNotifications();

                                } catch (error) {
                                    console.error(
                                        "[PConnect] Mark notification read failed:",
                                        error
                                    );

                                    readButton.disabled = false;

                                    alert(
                                        "Unable to mark notification as read: " +
                                        getErrorMessage(error)
                                    );
                                }
                            }
                        );

                        item.appendChild(readButton);
                    }

                    container.appendChild(item);
                }
            );
        }
    }

    console.log(
        "[PConnect] Notifications loaded:",
        cachedNotifications.length,
        "Unread:",
        unreadCount
    );

    return cachedNotifications;
};

// ==========================================
// REFRESH PAGE DATA
// ==========================================

async function refreshPaymentPageData() {
    transactionsLoaded = false;

    try {
        await window.loadTransactions();

    } catch (error) {
        console.error(
            "[PConnect] Transaction refresh failed:",
            error
        );
    }

    try {
        await window.loadDashboard();

    } catch (error) {
        console.error(
            "[PConnect] Dashboard refresh failed:",
            error
        );

        setElementText("totalRequests", "—");
        setElementText("waitingRequests", "—");
        setElementText("approvedRequests", "—");
        setElementText("rejectedRequests", "—");
    }

    try {
        await window.loadNotifications();

    } catch (error) {
        console.error(
            "[PConnect] Notification refresh failed:",
            error
        );

        const container = getElement(
            "notificationsList"
        );

        if (container) {
            container.replaceChildren();

            container.appendChild(
                createTextElement(
                    "p",
                    "Unable to load notifications. Please refresh."
                )
            );
        }
    }
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

    pendingIncompletePayment = payment;

    setPaymentEnabled(false);

    if (!currentPiAccessToken) {
        setPayStatus(
            "An incomplete payment was found. Waiting for Pi login to finish..."
        );

        return;
    }

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

        return;
    }

    processingIncompletePayment = true;

    setPaymentEnabled(false);

    setPayStatus(
        "Recovering your previous Pi payment..."
    );

    try {
        const data = await sendPaymentApi(
            "/api/complete",
            {
                paymentId: payment.identifier,
                txid: txid
            }
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

        pendingIncompletePayment = payment;

        setPayStatus(
            "Previous payment recovery failed: " +
            getErrorMessage(error) +
            ". Do not create another payment yet."
        );

    } finally {
        processingIncompletePayment = false;

        updatePaymentButton();
    }
}

// ==========================================
// PI LOGIN
// ==========================================

if (loginBtn) {
    loginBtn.addEventListener(
        "click",
        async function () {
            if (loginBtn.disabled || loginInProgress) {
                return;
            }

            loginInProgress = true;

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

                const scopes = [
                    "username",
                    "payments"
                ];

                const timeoutPromise = new Promise(
                    function (_, reject) {
                        loginTimeout = setTimeout(
                            function () {
                                timedOut = true;

                                reject(
                                    new Error(
                                        "Pi authentication timed out after 15 seconds. Please retry in Pi Browser."
                                    )
                                );
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

                currentPiUsername =
                    authResult.user.username;

                currentPiAccessToken =
                    authResult.accessToken;

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

                // Recover incomplete payment first.

                if (pendingIncompletePayment) {
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
                    updatePaymentButton();

                    setPayStatus(
                        "Pi connected successfully. You can use the 0.01 π Test-Pi payment if your request is approved."
                    );
                }

                // Load dashboard and user data.

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
                    "Login failed: " +
                    getErrorMessage(error)
                );

                setPayStatus(
                    timedOut
                        ? "Pi sign-in did not return a result. Please retry in Pi Browser."
                        : "Pi login error: " +
                          getErrorMessage(error)
                );

            } finally {
                loginInProgress = false;
                loginBtn.disabled = false;
            }
        }
    );
}

// ==========================================
// CREATE PI PAYMENT
// ==========================================

if (payBtn) {
    payBtn.addEventListener(
        "click",
        function () {
            const amount = 0.01;

            if (!piSdkReady || !window.Pi) {
                setPayStatus(
                    "Pi SDK is unavailable. Reload PConnect in Pi Browser."
                );

                return;
            }

            if (
                !currentPiUsername ||
                !currentPiAccessToken
            ) {
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

                return;
            }

            if (
                typeof window.Pi.createPayment !== "function"
            ) {
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
                        // SERVER APPROVAL

                        onReadyForServerApproval:
                            async function (paymentId) {
                                try {
                                    await sendPaymentApi(
                                        "/api/approve",
                                        {
                                            paymentId: paymentId
                                        }
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
                                        getErrorMessage(error) +
                                        ". Check the payment status before retrying."
                                    );

                                    // Do not automatically start
                                    // another payment.

                                    setPaymentEnabled(false);
                                }
                            },

                        // SERVER COMPLETION

                        onReadyForServerCompletion:
                            async function (paymentId, txid) {
                                setPayStatus(
                                    "Completing payment and saving transaction..."
                                );

                                try {
                                    await sendPaymentApi(
                                        "/api/complete",
                                        {
                                            paymentId: paymentId,
                                            txid: txid,
                                            pi_username: currentPiUsername,
                                            service: currentService,
                                            request_id: currentRequestId
                                        }
                                    );

                                    setPayStatus(
                                        "✔️ Payment complete! Request #" +
                                        currentRequestId +
                                        " has been linked to this transaction."
                                    );

                                    await refreshPaymentPageData();

                                } catch (error) {
                                    console.error(
                                        "[PConnect] Completion failed:",
                                        error
                                    );

                                    setPayStatus(
                                        "Payment completion failed: " +
                                        getErrorMessage(error) +
                                        ". Do not create another payment until this one is checked."
                                    );

                                    // Keep payment disabled
                                    // until the payment is checked.

                                    setPaymentEnabled(false);
                                }
                            },

                        // USER CANCELLED

                        onCancel: function (paymentId) {
                            console.log(
                                "[PConnect] Payment cancelled:",
                                paymentId
                            );

                            setPayStatus(
                                "Payment cancelled."
                            );

                            updatePaymentButton();
                        },

                        // PAYMENT ERROR

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

                            updatePaymentButton();
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

                updatePaymentButton();

                if (loginBtn) {
                    loginBtn.disabled = false;
                }
            }
        }
    );
}

// ==========================================
// END
// ==========================================

console.log("[PConnect] app.js loaded.");
