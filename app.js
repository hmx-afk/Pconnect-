// ==========================================
// PConnect - Secure Pi SDK Testnet App
// Authentication + Payments
// Request Validation
// Dashboard + Notifications + Transactions
// Payment Status Verification
// Incomplete Payment Recovery
// Secure Payment State Management
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

    if (typeof window.Pi === "undefined") {
        throw new Error(
            "Pi SDK is unavailable. Open PConnect inside Pi Browser."
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

let authAttemptId = 0;

// Prevent duplicate recovery attempts.
let recoveryAttemptId = 0;

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

if (urlRequestId !== null) {

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
    urlRequestId !== null
        ? urlRequestId
        : getValidRequestId(
            sessionStorage.getItem(
                "pconnect_request_id"
            )
        );

if (currentRequestId === null) {

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

function normalizeStatus(value) {

    return String(value || "")
        .trim()
        .toLowerCase();
}

function updatePaymentButton() {

    const canPay =
        Boolean(currentPiUsername) &&
        Boolean(currentPiAccessToken) &&
        Boolean(currentRequestId) &&
        Boolean(currentRequest) &&
        normalizeStatus(
            currentRequest.review_status
        ) === "approved" &&
        normalizeStatus(
            currentRequest.order_status
        ) === "pending" &&
        !paymentInProgress &&
        !paymentLocked &&
        !pendingIncompletePayment &&
        !processingIncompletePayment;

    setPaymentEnabled(canPay);
}

// ==========================================
// PAYMENT STATE
// ==========================================

function releasePaymentProgress() {

    paymentInProgress = false;

    if (loginBtn) {
        loginBtn.disabled = false;
    }

    updatePaymentButton();
}

function lockPayment(message) {

    paymentLocked = true;

    setPaymentEnabled(false);

    if (message) {
        setPayStatus(message);
    }
}

function unlockPayment() {

    paymentLocked = false;

    updatePaymentButton();
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

    } catch (error) {

        if (error.name === "AbortError") {

            throw new Error(
                "The request timed out. Please check your connection."
            );
        }

        throw error;

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
// PAYMENT IDENTIFIER HELPERS
// ==========================================

function getPaymentIdentifier(payment) {

    if (!payment || typeof payment !== "object") {
        return null;
    }

    const identifier =
        payment.identifier ||
        payment.paymentId ||
        payment.payment_id;

    if (
        typeof identifier !== "string" ||
        !identifier.trim() ||
        identifier.length > 200
    ) {
        return null;
    }

    return identifier.trim();
}

function getPaymentTxid(payment) {

    if (!payment || typeof payment !== "object") {
        return null;
    }

    const txid =
        payment.transaction &&
        payment.transaction.txid;

    if (
        typeof txid !== "string" ||
        !txid.trim() ||
        txid.length > 200
    ) {
        return null;
    }

    return txid.trim();
}

// ==========================================
// SAVE INCOMPLETE PAYMENT
// ==========================================

function savePendingPayment(payment) {

    const paymentId =
        getPaymentIdentifier(payment);

    if (!paymentId) {
        return false;
    }

    const existingId =
        getPaymentIdentifier(
            pendingIncompletePayment
        );

    if (
        existingId &&
        existingId !== paymentId
    ) {

        lockPayment(
            "Another incomplete payment already exists. Do not start another payment."
        );

        return false;
    }

    pendingIncompletePayment = {
        identifier: paymentId,

        transaction: {
            txid: getPaymentTxid(payment)
        }
    };

    lockPayment(
        "An incomplete payment was found. Verifying its status..."
    );

    return true;
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
        normalizeStatus(request.review_status) !==
        "approved"
    ) {

        currentRequest = null;
        currentService = null;

        updatePaymentButton();

        throw new Error(
            "This request has not been approved yet."
        );
    }

    if (
        normalizeStatus(request.order_status) !==
        "pending"
    ) {

        currentRequest = null;
        currentService = null;

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
        currentService = null;

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

                return normalizeStatus(
                    transaction.status
                ) === "completed";
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

            const value = normalizeStatus(
                request.review_status
            );

            return (
                value === "waiting for review" ||
                value === "waiting"
            );
        }
    ).length;

    const approved = cachedRequests.filter(
        function (request) {

            return normalizeStatus(
                request.review_status
            ) === "approved";
        }
    ).length;

    const rejected = cachedRequests.filter(
        function (request) {

            return normalizeStatus(
                request.review_status
            ) === "rejected";
        }
    ).length;

    setElementText("totalRequests", total);
    setElementText("waitingRequests", waiting);
    setElementText("approvedRequests", approved);
    setElementText("rejectedRequests", rejected);

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

    try {

        if (!transactionsLoaded) {
            await window.loadTransactions();
        }

        const completed =
            cachedTransactions.filter(
                function (transaction) {

                    return normalizeStatus(
                        transaction.status
                    ) === "completed";
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
// PAYMENT STATUS CHECK
// ==========================================

async function checkPaymentStatus(paymentId) {

    if (
        typeof paymentId !== "string" ||
        !paymentId.trim()
    ) {

        throw new Error(
            "A valid payment ID is required."
        );
    }

    const data = await sendPaymentApi(
        "/api/payment-status",
        {
            paymentId: paymentId.trim()
        }
    );

    const state = normalizeStatus(
        data.state || data.status
    );

    return {
        ...data,
        state: state
    };
}

// ==========================================
// VERIFY CANCELLED PAYMENT
// ==========================================

async function verifyCancelledPayment(paymentId) {

    lockPayment(
        "Verifying cancellation with Pi..."
    );

    try {

        const result =
            await checkPaymentStatus(paymentId);

        if (
            result.state !== "cancelled" ||
            result.canRetry !== true
        ) {

            lockPayment(
                "The server has not confirmed that this payment is safe to retry. Do not pay again."
            );

            return false;
        }

        pendingIncompletePayment = null;

        await validatePaymentRequest();

        unlockPayment();

        setPayStatus(
            "The previous payment was confirmed cancelled. You may retry this approved request."
        );

        return true;

    } catch (error) {

        console.error(
            "[PConnect] Cancellation verification failed:",
            error
        );

        lockPayment(
            "Cancellation could not be verified: " +
            getErrorMessage(error) +
            ". Do not start another payment."
        );

        return false;
    }
}

// ==========================================
// COMPLETE RECOVERED PAYMENT
// ==========================================

async function completeRecoveredPayment(
    paymentId,
    txid
) {

    if (!paymentId || !txid) {

        throw new Error(
            "Payment ID and transaction ID are required."
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

    currentRequest = null;
    currentService = null;

    setPayStatus(
        "Previous Pi payment recovered successfully."
    );

    await refreshPaymentPageData();

    return true;
}

// ==========================================
// HANDLE PAYMENT STATUS
// ==========================================

async function handlePaymentStatus(paymentId) {

    const result =
        await checkPaymentStatus(paymentId);

    switch (result.state) {

        case "recorded":

            pendingIncompletePayment = null;

            unlockPayment();

            setPayStatus(
                "This payment is already recorded successfully."
            );

            await refreshPaymentPageData();

            return "recorded";

        case "completed":

            if (!result.txid) {

                lockPayment(
                    "Pi reports a completed payment, but its transaction ID is unavailable. Do not pay again."
                );

                return "verification_required";
            }

            await completeRecoveredPayment(
                paymentId,
                result.txid
            );

            return "completed";

        case "cancelled":

            if (result.canRetry === true) {

                pendingIncompletePayment = null;

                await validatePaymentRequest();

                unlockPayment();

                setPayStatus(
                    "The previous payment was confirmed cancelled. You can retry."
                );

                return "cancelled";
            }

            lockPayment(
                "Payment cancellation is not yet confirmed as safe to retry."
            );

            return "verification_required";

        case "processing":

            lockPayment(
                "Your Pi payment is still processing. Do not start another payment."
            );

            return "processing";

        case "pending":

            lockPayment(
                "Your Pi payment is still pending. Do not start another payment."
            );

            return "pending";

        case "verification_required":

            lockPayment(
                "Payment verification is required. Do not pay again."
            );

            return "verification_required";

        default:

            lockPayment(
                "The payment status is unknown. Do not start another payment."
            );

            return "unknown";
    }
}

// ==========================================
// INCOMPLETE PAYMENT CALLBACK
// ==========================================

function onIncompletePaymentFound(payment) {

    console.log(
        "[PConnect] Incomplete payment found."
    );

    const saved = savePendingPayment(payment);

    if (!saved) {
        return;
    }

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
        !currentPiAccessToken ||
        processingIncompletePayment
    ) {
        return false;
    }

    const paymentId =
        getPaymentIdentifier(payment);

    if (!paymentId) {

        lockPayment(
            "The incomplete payment has an invalid payment ID."
        );

        return false;
    }

    processingIncompletePayment = true;
    paymentLocked = true;

    const thisRecovery = ++recoveryAttemptId;

    setPaymentEnabled(false);

    setPayStatus(
        "Checking your previous Pi payment..."
    );

    let recovered = false;

    try {

        const result =
            await checkPaymentStatus(paymentId);

        if (thisRecovery !== recoveryAttemptId) {
            return false;
        }

        switch (result.state) {

            case "recorded":

                pendingIncompletePayment = null;

                paymentLocked = false;

                setPayStatus(
                    "Your previous payment is already recorded."
                );

                await refreshPaymentPageData();

                recovered = true;

                break;

            case "completed":

                if (!result.txid) {

                    throw new Error(
                        "Payment is completed but its transaction ID is unavailable."
                    );
                }

                await completeRecoveredPayment(
                    paymentId,
                    result.txid
                );

                recovered = true;

                break;

            case "cancelled":

                if (result.canRetry === true) {

                    pendingIncompletePayment = null;

                    await validatePaymentRequest();

                    paymentLocked = false;

                    setPayStatus(
                        "The previous payment was confirmed cancelled. You may retry."
                    );

                } else {

                    lockPayment(
                        "Payment cancellation is not confirmed. Do not pay again."
                    );
                }

                break;

            case "processing":

                lockPayment(
                    "Your previous payment is still processing. Do not pay again."
                );

                break;

            case "pending":

                lockPayment(
                    "Your previous payment is still pending. Do not pay again."
                );

                break;

            case "verification_required":

                lockPayment(
                    "Your previous payment requires verification. Do not pay again."
                );

                break;

            default:

                lockPayment(
                    "The previous payment status is unknown. Do not pay again."
                );
        }

    } catch (error) {

        console.error(
            "[PConnect] Payment recovery failed:",
            error
        );

        pendingIncompletePayment = payment;

        lockPayment(
            "Payment recovery failed: " +
            getErrorMessage(error) +
            ". Do not create another payment."
        );

    } finally {

        processingIncompletePayment = false;

        updatePaymentButton();
    }

    return recovered;
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

            const thisAttempt = ++authAttemptId;

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

                if (thisAttempt !== authAttemptId) {
                    return;
                }

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

                } else if (currentRequestId) {

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

                if (loginBtn) {
                    loginBtn.disabled = false;
                }

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

            if (
                paymentInProgress ||
                processingIncompletePayment
            ) {
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

                                    if (
                                        !paymentId ||
                                        typeof paymentId !== "string"
                                    ) {

                                        throw new Error(
                                            "Pi returned no valid payment ID."
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

                                    lockPayment(
                                        "Approval failed: " +
                                        getErrorMessage(error) +
                                        ". Verify this payment before trying again."
                                    );

                                    releasePaymentProgress();
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

                                    currentRequest = null;
                                    currentService = null;

                                    setPayStatus(
                                        "✔️ Payment completed successfully for Request #" +
                                        currentRequestId
                                    );

                                    await refreshPaymentPageData();

                                } catch (error) {

                                    console.error(
                                        "[PConnect] Completion failed:",
                                        error
                                    );

                                    // Save payment for recovery.

                                    savePendingPayment({
                                        identifier: paymentId,

                                        transaction: {
                                            txid: txid
                                        }
                                    });

                                    lockPayment(
                                        "Payment completion needs verification: " +
                                        getErrorMessage(error) +
                                        ". Do not pay again."
                                    );

                                } finally {

                                    releasePaymentProgress();
                                }
                            },

                        // USER CANCELLED

                        onCancel: async function (paymentId) {

                            console.log(
                                "[PConnect] Payment cancellation callback:",
                                paymentId
                            );

                            if (
                                typeof paymentId !== "string" ||
                                !paymentId.trim()
                            ) {

                                lockPayment(
                                    "Pi cancellation needs verification. Do not pay again."
                                );

                                releasePaymentProgress();

                                return;
                            }

                            // Never unlock based only on callback.

                            savePendingPayment({
                                identifier: paymentId
                            });

                            releasePaymentProgress();

                            await verifyCancelledPayment(
                                paymentId
                            );
                        },

                        // PAYMENT ERROR

                        onError: async function (
                            error,
                            payment
                        ) {

                            console.error(
                                "[PConnect] Payment error:",
                                error,
                                payment
                            );

                            const paymentId =
                                getPaymentIdentifier(payment);

                            if (paymentId) {

                                savePendingPayment(payment);

                                releasePaymentProgress();

                                try {

                                    await handlePaymentStatus(
                                        paymentId
                                    );

                                } catch (statusError) {

                                    console.error(
                                        "[PConnect] Error status verification failed:",
                                        statusError
                                    );

                                    lockPayment(
                                        "Payment status could not be verified. Do not pay again."
                                    );
                                }

                            } else {

                                lockPayment(
                                    "Payment error: " +
                                    getErrorMessage(error) +
                                    ". Payment status must be checked before retrying."
                                );

                                releasePaymentProgress();
                            }
                        }
                    }
                );

            } catch (error) {

                console.error(
                    "[PConnect] Payment could not start:",
                    error
                );

                // Only unlock if payment creation
                // failed before Pi created a payment.

                if (!pendingIncompletePayment) {

                    paymentLocked = false;

                } else {

                    paymentLocked = true;
                }

                setPayStatus(
                    getErrorMessage(error)
                );

                releasePaymentProgress();
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
