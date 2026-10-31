// ==========================================
// PConnect - Secure Pi SDK Testnet App
// Authentication + Payments
// Request Validation
// Dashboard + Notifications + Transactions
// Incomplete Payment Recovery
// ==========================================

"use strict";

// ==========================================
// CONFIGURATION
// ==========================================

const PAYMENT_AMOUNT = 0.01;
const PAYMENT_CURRENCY = "Pi";
const REQUEST_TIMEOUT = 15000;

// ==========================================
// PI SDK INITIALIZATION
// ==========================================

let piSdkReady = false;
let piInitError = null;

try {
    if (
        typeof window.Pi === "undefined"
    ) {
        throw new Error(
            "Pi SDK is unavailable. Open PConnect inside Pi Browser."
        );
    }

    window.Pi.init({
        version: "2.0",
        sandbox: true
    });

    piSdkReady = true;

    console.log(
        "[PConnect] Pi SDK initialized."
    );

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
const piStatus = document.getElementById("piStatus");
const payBtn = document.getElementById("payBtn");
const payStatus = document.getElementById("payStatus");

// ==========================================
// PI USER
// ==========================================

let currentPiUsername = null;
let currentPiAccessToken = "";

// ==========================================
// APP STATE
// ==========================================

let loginInProgress = false;
let paymentInProgress = false;
let paymentLocked = false;

let pendingIncompletePayment = null;
let processingIncompletePayment = false;

let cachedRequests = [];
let cachedTransactions = [];
let cachedNotifications = [];

let transactionsLoaded = false;

// ==========================================
// REQUEST ID
// ==========================================

function getValidRequestId(value) {

    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ""
    ) {
        return null;
    }

    const id = Number(value);

    if (
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    return id;
}

const pageParams = new URLSearchParams(
    window.location.search
);

const urlRequestId = getValidRequestId(
    pageParams.get("request_id")
);

if (urlRequestId) {

    sessionStorage.setItem(
        "pconnect_request_id",
        String(urlRequestId)
    );

} else if (pageParams.has("request_id")) {

    sessionStorage.removeItem(
        "pconnect_request_id"
    );
}

let currentRequestId =
    urlRequestId ||
    getValidRequestId(
        sessionStorage.getItem(
            "pconnect_request_id"
        )
    );

if (!currentRequestId) {

    sessionStorage.removeItem(
        "pconnect_request_id"
    );
}

// ==========================================
// CURRENT REQUEST
// ==========================================

let currentRequest = null;
let currentService = null;

// ==========================================
// STATUS HELPERS
// ==========================================

function setPiStatus(message) {

    if (piStatus) {
        piStatus.textContent = message;
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
        Boolean(currentRequestId) &&
        Boolean(currentRequest) &&
        currentRequest.review_status === "Approved" &&
        currentRequest.order_status === "Pending" &&
        !paymentInProgress &&
        !paymentLocked &&
        !pendingIncompletePayment &&
        !processingIncompletePayment;

    setPaymentEnabled(canPay);
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
// FETCH WITH TIMEOUT
// ==========================================

async function fetchWithTimeout(
    url,
    options = {},
    timeout = REQUEST_TIMEOUT
) {

    const controller = new AbortController();

    const timer = setTimeout(
        function () {
            controller.abort();
        },
        timeout
    );

    try {

        return await fetch(url, {
            ...options,
            signal: controller.signal
        });

    } finally {

        clearTimeout(timer);
    }
}

// ==========================================
// API HEADERS
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
// API RESPONSE
// ==========================================

async function readApiResponse(response) {

    let data;

    try {

        data = await response.json();

    } catch {

        throw new Error(
            "The server returned an invalid response."
        );
    }

    if (
        !response.ok ||
        !data ||
        data.success !== true
    ) {

        throw new Error(
            data && data.error
                ? data.error
                : "API request failed."
        );
    }

    return data;
}

// ==========================================
// AUTHENTICATED API
// ==========================================

async function fetchPiApi(
    endpoint,
    options = {}
) {

    if (!currentPiAccessToken) {

        throw new Error(
            "Please sign in with Pi first."
        );
    }

    const response = await fetchWithTimeout(
        endpoint,
        {
            ...options,

            headers: {
                ...piJsonHeaders(),
                ...(options.headers || {})
            },

            cache: "no-store"
        }
    );

    return readApiResponse(response);
}

// ==========================================
// PAYMENT API
// ==========================================

async function sendPaymentApi(
    endpoint,
    body
) {

    if (!currentPiAccessToken) {

        throw new Error(
            "Pi authentication is required."
        );
    }

    const response = await fetchWithTimeout(
        endpoint,
        {
            method: "POST",

            headers: piJsonHeaders(),

            body: JSON.stringify(body),

            cache: "no-store"
        }
    );

    return readApiResponse(response);
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

function createTextElement(
    tag,
    value,
    className
) {

    const element = document.createElement(tag);

    element.textContent = String(value ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}

// ==========================================
// DATE FORMAT
// ==========================================

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
// LOAD USER REQUESTS
// ==========================================

async function loadUserRequests() {

    const data = await fetchPiApi(
        "/api/my-requests"
    );

    if (!Array.isArray(data.requests)) {

        throw new Error(
            "Invalid requests response."
        );
    }

    cachedRequests = data.requests;

    return cachedRequests;
}

// ==========================================
// VALIDATE PAYMENT REQUEST
// ==========================================

async function validatePaymentRequest() {

    if (!currentRequestId) {

        currentRequest = null;
        currentService = null;

        updatePaymentButton();

        throw new Error(
            "No request ID found. Open Payments from My Requests."
        );
    }

    await loadUserRequests();

    const request = cachedRequests.find(
        function (item) {

            return (
                getValidRequestId(item.id) ===
                currentRequestId
            );
        }
    );

    if (!request) {

        currentRequest = null;
        currentService = null;

        updatePaymentButton();

        throw new Error(
            "This request was not found in your account."
        );
    }

    if (
        String(request.review_status || "")
            .trim()
            .toLowerCase() !== "approved"
    ) {

        currentRequest = null;

        updatePaymentButton();

        throw new Error(
            "This request has not been approved yet."
        );
    }

    if (
        String(request.order_status || "")
            .trim()
            .toLowerCase() !== "pending"
    ) {

        currentRequest = null;

        updatePaymentButton();

        throw new Error(
            "This request is not awaiting payment."
        );
    }

    currentRequest = request;

    currentService = String(
        request.service || ""
    ).trim();

    if (!currentService) {

        currentRequest = null;

        updatePaymentButton();

        throw new Error(
            "The request service is missing."
        );
    }

    updatePaymentButton();

    return request;
}

// ==========================================
// TRANSACTION HISTORY
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

    const completedCount =
        cachedTransactions.filter(
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

    setElementText(
        "totalTransactions",
        cachedTransactions.length
    );

    const container =
        getElement("transactionsList") ||
        getElement("transactionList") ||
        getElement("transactionsContainer") ||
        getElement("transactionHistory") ||
        getElement("transactions");

    if (container) {

        container.replaceChildren();

        if (cachedTransactions.length === 0) {

            container.appendChild(
                createTextElement(
                    "p",
                    "No transactions found.",
                    "empty"
                )
            );

        } else {

            cachedTransactions.forEach(
                function (transaction) {

                    const item =
                        document.createElement("div");

                    item.className = "transaction";

                    const top =
                        document.createElement("div");

                    top.className = "transaction-top";

                    top.append(
                        createTextElement(
                            "strong",
                            String(
                                transaction.amount ?? "0"
                            ) +
                            " " +
                            String(
                                transaction.currency || "Pi"
                            ),
                            "amount"
                        ),

                        createTextElement(
                            "span",
                            transaction.status || "Unknown",
                            "status"
                        )
                    );

                    const details =
                        document.createElement("div");

                    details.className = "details";

                    const rows = [
                        [
                            "Service",
                            transaction.service ||
                            "PConnect Service"
                        ],
                        [
                            "Request ID",
                            transaction.request_id
                                ? "Request #" +
                                  transaction.request_id
                                : "Not linked"
                        ],
                        [
                            "Date",
                            formatDate(
                                transaction.created_at
                            )
                        ]
                    ];

                    rows.forEach(
                        function (row) {

                            const line =
                                document.createElement("div");

                            line.className = "row";

                            line.append(
                                createTextElement(
                                    "span",
                                    row[0],
                                    "label"
                                ),

                                createTextElement(
                                    "span",
                                    row[1],
                                    "value"
                                )
                            );

                            details.appendChild(line);
                        }
                    );

                    item.append(top, details);

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
// DASHBOARD
// ==========================================

window.loadDashboard = async function () {

    const hasDashboard = [
        "totalRequests",
        "waitingRequests",
        "approvedRequests",
        "rejectedRequests",
        "recentActivity"
    ].some(function (id) {

        return Boolean(getElement(id));
    });

    if (!hasDashboard) {
        return;
    }

    await loadUserRequests();

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

    // RECENT ACTIVITY

    const container = getElement(
        "recentActivity"
    );

    if (container) {

        container.replaceChildren();

        const recent = [...cachedRequests]
            .sort(function (a, b) {

                return (
                    new Date(b.created_at || 0) -
                    new Date(a.created_at || 0)
                );
            })
            .slice(0, 5);

        if (recent.length === 0) {

            container.appendChild(
                createTextElement(
                    "p",
                    "No recent activity found."
                )
            );

        } else {

            recent.forEach(
                function (request) {

                    const item =
                        document.createElement("div");

                    item.className = "activity-item";

                    item.append(
                        createTextElement(
                            "strong",
                            request.service ||
                            "Service Request"
                        ),

                        createTextElement(
                            "p",
                            "Request #" + request.id
                        ),

                        createTextElement(
                            "p",
                            "Review: " +
                            (request.review_status || "Unknown")
                        ),

                        createTextElement(
                            "p",
                            "Order: " +
                            (request.order_status || "Unknown")
                        ),

                        createTextElement(
                            "small",
                            formatDate(request.created_at)
                        )
                    );

                    container.appendChild(item);
                }
            );
        }
    }

    // PAYMENT COUNT

    try {

        if (!transactionsLoaded) {
            await window.loadTransactions();
        }

        const completed =
            cachedTransactions.filter(
                function (transaction) {

                    return String(
                        transaction.status || ""
                    ).trim().toLowerCase() === "completed";
                }
            ).length;

        setElementText(
            "completedPayments",
            completed
        );

    } catch (error) {

        console.error(
            "[PConnect] Transaction count failed:",
            error
        );

        setElementText(
            "completedPayments",
            "—"
        );
    }

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

    const unreadCount =
        cachedNotifications.filter(
            function (notification) {

                return notification.is_read === false;
            }
        ).length;

    const badge = getElement(
        "notificationBadge"
    );

    if (badge) {

        badge.textContent = String(unreadCount);
        badge.hidden = unreadCount === 0;
    }

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

                    const unread =
                        notification.is_read === false;

                    const item =
                        document.createElement("div");

                    item.className = unread
                        ? "notification-item unread"
                        : "notification-item";

                    item.append(
                        createTextElement(
                            "strong",
                            notification.title ||
                            "Notification"
                        ),

                        createTextElement(
                            "p",
                            notification.message || ""
                        ),

                        createTextElement(
                            "small",
                            formatDate(
                                notification.created_at
                            )
                        )
                    );

                    if (unread) {

                        const button =
                            createTextElement(
                                "button",
                                "Mark as read"
                            );

                        button.type = "button";

                        button.addEventListener(
                            "click",
                            async function () {

                                button.disabled = true;

                                try {

                                    await markNotificationAsRead(
                                        notification.id
                                    );

                                    notification.is_read = true;

                                    await window.loadNotifications();

                                } catch (error) {

                                    console.error(
                                        "[PConnect] Notification update failed:",
                                        error
                                    );

                                    button.disabled = false;

                                    alert(
                                        getErrorMessage(error)
                                    );
                                }
                            }
                        );

                        item.appendChild(button);
                    }

                    container.appendChild(item);
                }
            );
        }
    }

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
            "[PConnect] Transactions refresh failed:",
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
    }

    try {

        await window.loadNotifications();

    } catch (error) {

        console.error(
            "[PConnect] Notifications refresh failed:",
            error
        );
    }
}

// ==========================================
// INCOMPLETE PAYMENT CALLBACK
// ==========================================

function onIncompletePaymentFound(payment) {

    console.log(
        "[PConnect] Incomplete payment found."
    );

    if (
        !payment ||
        !payment.identifier
    ) {

        console.warn(
            "[PConnect] Invalid incomplete payment."
        );

        return;
    }

    if (
        pendingIncompletePayment &&
        pendingIncompletePayment.identifier !==
            payment.identifier
    ) {

        paymentLocked = true;

        setPaymentEnabled(false);

        setPayStatus(
            "An incomplete payment needs attention. Do not start another payment."
        );

        return;
    }

    pendingIncompletePayment = payment;
    paymentLocked = true;

    setPaymentEnabled(false);

    if (!currentPiAccessToken) {

        setPayStatus(
            "An incomplete payment was found. Waiting for Pi login..."
        );

        return;
    }

    processIncompletePayment(payment);
}

// ==========================================
// RECOVER INCOMPLETE PAYMENT
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

    if (
        !txid ||
        typeof txid !== "string"
    ) {

        pendingIncompletePayment = payment;
        paymentLocked = true;

        setPaymentEnabled(false);

        setPayStatus(
            "The previous payment has no transaction ID yet. Do not create another payment."
        );

        return;
    }

    processingIncompletePayment = true;
    paymentLocked = true;

    setPaymentEnabled(false);

    setPayStatus(
        "Recovering your previous Pi payment..."
    );

    try {

        await sendPaymentApi(
            "/api/complete",
            {
                paymentId: payment.identifier,
                txid: txid
            }
        );

        pendingIncompletePayment = null;
        paymentLocked = false;

        setPayStatus(
            "Previous Pi payment recovered successfully."
        );

        await refreshPaymentPageData();

    } catch (error) {

        console.error(
            "[PConnect] Payment recovery failed:",
            error
        );

        pendingIncompletePayment = payment;
        paymentLocked = true;

        setPayStatus(
            "Payment recovery failed: " +
            getErrorMessage(error) +
            ". Do not create another payment."
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

            if (
                loginInProgress ||
                paymentInProgress
            ) {
                return;
            }

            loginInProgress = true;

            loginBtn.disabled = true;
            setPaymentEnabled(false);

            setPiStatus(
                "Connecting to Pi..."
            );

            setPayStatus(
                "Waiting for Pi authentication..."
            );

            let loginTimeout = null;
            let timedOut = false;

            try {

                if (!piSdkReady) {

                    throw piInitError ||
                        new Error(
                            "Open PConnect inside Pi Browser."
                        );
                }

                if (
                    !window.Pi ||
                    typeof window.Pi.authenticate !==
                        "function"
                ) {

                    throw new Error(
                        "Pi authentication is unavailable."
                    );
                }

                const scopes = [
                    "username",
                    "payments"
                ];

                const authPromise =
                    window.Pi.authenticate(
                        scopes,
                        onIncompletePaymentFound
                    );

                const timeoutPromise =
                    new Promise(
                        function (_, reject) {

                            loginTimeout = setTimeout(
                                function () {

                                    timedOut = true;

                                    reject(
                                        new Error(
                                            "Pi authentication timed out after 15 seconds."
                                        )
                                    );

                                },
                                REQUEST_TIMEOUT
                            );
                        }
                    );

                const authResult = await Promise.race([
                    authPromise,
                    timeoutPromise
                ]);

                clearTimeout(loginTimeout);
                loginTimeout = null;

                if (
                    !authResult ||
                    !authResult.user ||
                    !authResult.user.username ||
                    !authResult.accessToken
                ) {

                    throw new Error(
                        "Pi returned incomplete authentication data."
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
                    "Connected ✔️ " +
                    currentPiUsername
                );

                console.log(
                    "[PConnect] Pi login successful."
                );

                // RECOVER PAYMENT FIRST

                if (pendingIncompletePayment) {

                    await processIncompletePayment(
                        pendingIncompletePayment
                    );
                }

                // VALIDATE REQUEST

                if (currentRequestId) {

                    try {

                        await validatePaymentRequest();

                        setPayStatus(
                            "Pi connected. Your approved request is ready for payment."
                        );

                    } catch (error) {

                        setPayStatus(
                            getErrorMessage(error)
                        );
                    }

                } else {

                    setPayStatus(
                        "Pi connected. Open Payments from an approved request."
                    );
                }

                // LOAD USER DATA

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

                currentRequest = null;
                currentService = null;

                setPaymentEnabled(false);

                setPiStatus(
                    "Login failed: " +
                    getErrorMessage(error)
                );

                setPayStatus(
                    timedOut
                        ? "Pi sign-in timed out. Please retry in Pi Browser."
                        : getErrorMessage(error)
                );

            } finally {

                loginInProgress = false;

                loginBtn.disabled = false;

                updatePaymentButton();
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
        async function () {

            if (paymentInProgress) {
                return;
            }

            if (!piSdkReady || !window.Pi) {

                setPayStatus(
                    "Pi SDK is unavailable. Open PConnect in Pi Browser."
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

            if (
                pendingIncompletePayment ||
                processingIncompletePayment ||
                paymentLocked
            ) {

                setPaymentEnabled(false);

                setPayStatus(
                    "A previous payment needs attention. Do not start another payment."
                );

                return;
            }

            if (
                typeof window.Pi.createPayment !==
                    "function"
            ) {

                setPayStatus(
                    "Pi payment service is unavailable."
                );

                return;
            }

            paymentInProgress = true;
            paymentLocked = true;

            setPaymentEnabled(false);

            if (loginBtn) {
                loginBtn.disabled = true;
            }

            setPayStatus(
                "Checking approved request..."
            );

            try {

                // RECHECK REQUEST BEFORE PAYMENT

                const request =
                    await validatePaymentRequest();

                const paymentMetadata = {
                    request_id: String(request.id),
                    service: currentService,
                    test: true
                };

                setPayStatus(
                    "Starting 0.01 π Test-Pi payment..."
                );

                window.Pi.createPayment(
                    {
                        amount: PAYMENT_AMOUNT,

                        memo:
                            "Payment for PConnect service",

                        metadata: paymentMetadata
                    },

                    {
                        // SERVER APPROVAL

                        onReadyForServerApproval:
                            async function (paymentId) {

                                try {

                                    if (!paymentId) {

                                        throw new Error(
                                            "Pi returned no payment ID."
                                        );
                                    }

                                    await sendPaymentApi(
                                        "/api/approve",
                                        {
                                            paymentId: paymentId
                                        }
                                    );

                                    setPayStatus(
                                        "Payment approved. Waiting for Pi transaction..."
                                    );

                                } catch (error) {

                                    console.error(
                                        "[PConnect] Approval failed:",
                                        error
                                    );

                                    paymentLocked = true;

                                    setPayStatus(
                                        "Approval failed: " +
                                        getErrorMessage(error) +
                                        ". Check this payment before trying again."
                                    );
                                }
                            },

                        // SERVER COMPLETION

                        onReadyForServerCompletion:
                            async function (
                                paymentId,
                                txid
                            ) {

                                setPayStatus(
                                    "Completing Pi payment..."
                                );

                                try {

                                    if (
                                        !paymentId ||
                                        !txid
                                    ) {

                                        throw new Error(
                                            "Payment ID or transaction ID is missing."
                                        );
                                    }

                                    await sendPaymentApi(
                                        "/api/complete",
                                        {
                                            paymentId: paymentId,
                                            txid: txid
                                        }
                                    );

                                    pendingIncompletePayment = null;
                                    paymentLocked = false;

                                    setPayStatus(
                                        "✔️ Payment completed successfully for Request #" +
                                        currentRequestId
                                    );

                                    await refreshPaymentPageData();

                                    // Request has been paid.
                                    currentRequest = null;

                                } catch (error) {

                                    console.error(
                                        "[PConnect] Completion failed:",
                                        error
                                    );

                                    paymentLocked = true;

                                    setPayStatus(
                                        "Payment completion needs checking: " +
                                        getErrorMessage(error) +
                                        ". Do not pay again."
                                    );
                                }
                            },

                        // USER CANCELLED

                        onCancel: function (paymentId) {

                            console.log(
                                "[PConnect] Payment cancelled:",
                                paymentId
                            );

                            paymentInProgress = false;
                            paymentLocked = false;

                            setPayStatus(
                                "Payment cancelled."
                            );

                            updatePaymentButton();

                            if (loginBtn) {
                                loginBtn.disabled = false;
                            }
                        },

                        // PAYMENT ERROR

                        onError: function (
                            error,
                            payment
                        ) {

                            console.error(
                                "[PConnect] Payment error:",
                                error,
                                payment
                            );

                            // Keep locked because payment
                            // state may need verification.

                            paymentLocked = true;

                            setPaymentEnabled(false);

                            setPayStatus(
                                "Payment error: " +
                                getErrorMessage(error) +
                                ". Check payment status before retrying."
                            );

                            if (loginBtn) {
                                loginBtn.disabled = false;
                            }
                        }
                    }
                );

            } catch (error) {

                console.error(
                    "[PConnect] Payment could not start:",
                    error
                );

                paymentInProgress = false;
                paymentLocked = false;

                setPayStatus(
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

console.log(
    "[PConnect] Secure app.js loaded."
);
