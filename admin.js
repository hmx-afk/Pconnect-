"use strict";

/* ==========================================
   CONFIGURATION
========================================== */

const API_TIMEOUT = 15000;
const ADMIN_SESSION_KEY = "pconnect_admin_key";

let adminKey =
    sessionStorage.getItem(ADMIN_SESSION_KEY) || "";

let loadingRequests = false;
let actionInProgress = false;

const loginBox =
    document.getElementById("loginBox");

const adminContent =
    document.getElementById("adminContent");

const loginBtn =
    document.getElementById("loginBtn");

const logoutBtn =
    document.getElementById("logoutBtn");

const refreshBtn =
    document.getElementById("refreshBtn");

const adminKeyInput =
    document.getElementById("adminKey");

const loginMessage =
    document.getElementById("loginMessage");

const requestsContainer =
    document.getElementById("requestsContainer");

const totalCount =
    document.getElementById("totalCount");


/* ==========================================
   SAFE HTML
========================================== */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* ==========================================
   API RESPONSE
========================================== */

async function apiRequest(url, options = {}) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        API_TIMEOUT
    );

    try {

        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            cache: "no-store"
        });

        const text = await response.text();

        let data = {};

        if (text) {

            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Invalid server response.");
            }

        }

        return {
            response,
            data
        };

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error("Request timed out. Please try again.");
        }

        throw error;

    } finally {

        clearTimeout(timer);

    }
}


/* ==========================================
   STATUS CLASS
========================================== */

function getOrderStatusClass(status) {

    switch (status) {

        case "Paid":
            return "paid";

        case "In Progress":
            return "in-progress";

        case "Completed":
            return "completed";

        case "Cancelled":
            return "cancelled";

        default:
            return "pending";
    }
}


/* ==========================================
   SHOW ADMIN
========================================== */

function showAdmin() {

    loginBox.classList.add("hidden");

    adminContent.classList.remove("hidden");

    logoutBtn.classList.remove("hidden");

    loadRequests();
}


/* ==========================================
   SHOW LOGIN
========================================== */

function showLogin() {

    loginBox.classList.remove("hidden");

    adminContent.classList.add("hidden");

    logoutBtn.classList.add("hidden");
}


/* ==========================================
   INVALIDATE SESSION
========================================== */

function invalidateSession() {

    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    adminKey = "";

    showLogin();

    loginMessage.innerHTML =
        '<div class="error">Admin session expired. Please login again.</div>';
}


/* ==========================================
   LOGIN
========================================== */

async function login() {

    const key = adminKeyInput.value.trim();

    if (!key || key.length > 4096) {

        loginMessage.innerHTML =
            '<div class="error">Please enter a valid admin key.</div>';

        return;
    }

    loginBtn.disabled = true;

    loginMessage.innerHTML =
        '<div class="message">Checking admin key...</div>';

    try {

        const result = await apiRequest(
            "/api/admin-requests",
            {
                method: "GET",
                headers: {
                    "x-admin-key": key
                }
            }
        );

        const { response, data } = result;

        if (!response.ok) {

            loginMessage.innerHTML =
                `<div class="error">
                    ${escapeHtml(data.error || "Invalid admin key.")}
                </div>`;

            return;
        }

        if (
            data.success !== true ||
            !Array.isArray(data.requests)
        ) {
            throw new Error("Unexpected server response.");
        }

        adminKey = key;

        sessionStorage.setItem(
            ADMIN_SESSION_KEY,
            adminKey
        );

        adminKeyInput.value = "";

        loginMessage.innerHTML =
            '<div class="success">Admin access granted.</div>';

        showAdmin();

    } catch (error) {

        console.error(error);

        loginMessage.innerHTML =
            `<div class="error">${escapeHtml(error.message)}</div>`;

    } finally {

        loginBtn.disabled = false;

    }
}


/* ==========================================
   LOAD REQUESTS
========================================== */

async function loadRequests() {

    if (loadingRequests || !adminKey) {
        return;
    }

    loadingRequests = true;

    refreshBtn.disabled = true;

    requestsContainer.innerHTML =
        '<div class="empty">Loading requests...</div>';

    try {

        const result = await apiRequest(
            "/api/admin-requests",
            {
                method: "GET",
                headers: {
                    "x-admin-key": adminKey
                }
            }
        );

        const { response, data } = result;

        if (response.status === 401) {

            invalidateSession();

            return;
        }

        if (!response.ok) {

            throw new Error(
                data.error || "Failed to load requests."
            );
        }

        if (
            data.success !== true ||
            !Array.isArray(data.requests)
        ) {
            throw new Error("Invalid requests data.");
        }

        const requests = data.requests;

        totalCount.textContent = requests.length;

        if (requests.length === 0) {

            requestsContainer.innerHTML =
                '<div class="empty">No requests found.</div>';

            return;
        }

        requestsContainer.innerHTML = requests.map(
            request => {

                const id = Number(request.id);

                if (
                    !Number.isSafeInteger(id) ||
                    id <= 0
                ) {
                    return "";
                }

                const reviewStatus =
                    request.review_status ||
                    "Waiting for review";

                const orderStatus =
                    request.order_status ||
                    "Pending";

                const reviewClass =
                    reviewStatus === "Approved"
                        ? "approved"
                        : reviewStatus === "Rejected"
                            ? "rejected"
                            : "pending";

                const orderClass =
                    getOrderStatusClass(orderStatus);

                const canStart =
                    orderStatus === "Paid" &&
                    reviewStatus === "Approved";

                const canComplete =
                    orderStatus === "In Progress" &&
                    reviewStatus === "Approved";

                const canCancel =
                    orderStatus === "Pending";

                const canReview =
                    reviewStatus === "Waiting for review";

                return `

                    <div class="request-card">

                        <h3>
                            ${escapeHtml(request.name)}
                        </h3>

                        <div class="info">

                            <strong>Request ID:</strong>
                            #${id}

                            <br>

                            <strong>Service:</strong>
                            ${escapeHtml(request.service)}

                            <br>

                            <strong>Contact:</strong>
                            ${escapeHtml(request.contact)}

                            <br>

                            <strong>Details:</strong>
                            ${escapeHtml(request.details)}

                        </div>

                        <div class="section-title">
                            Review Status
                        </div>

                        <div class="status ${reviewClass}">
                            ${escapeHtml(reviewStatus)}
                        </div>

                        <div class="section-title">
                            Order Status
                        </div>

                        <div class="status ${orderClass}">
                            ${escapeHtml(orderStatus)}
                        </div>

                        <div class="action-box">

                            <button
                                type="button"
                                class="approve"
                                data-id="${id}"
                                data-action="approve"
                                ${canReview ? "" : "disabled"}
                            >
                                ✅ Approve
                            </button>

                            <button
                                type="button"
                                class="reject"
                                data-id="${id}"
                                data-action="reject"
                                ${canReview ? "" : "disabled"}
                            >
                                ❌ Reject
                            </button>

                        </div>

                        <div class="action-box">

                            <button
                                type="button"
                                class="progress"
                                data-id="${id}"
                                data-action="in_progress"
                                ${canStart ? "" : "disabled"}
                            >
                                🔵 Start / In Progress
                            </button>

                            <button
                                type="button"
                                class="complete"
                                data-id="${id}"
                                data-action="complete"
                                ${canComplete ? "" : "disabled"}
                            >
                                🟢 Complete
                            </button>

                            <button
                                type="button"
                                class="cancel"
                                data-id="${id}"
                                data-action="cancel"
                                ${canCancel ? "" : "disabled"}
                            >
                                ❌ Cancel
                            </button>

                        </div>

                    </div>

                `;

            }
        ).join("");

    } catch (error) {

        console.error(error);

        requestsContainer.innerHTML =
            `<div class="empty">
                Failed to load requests.
                <br>
                ${escapeHtml(error.message)}
            </div>`;

    } finally {

        loadingRequests = false;

        refreshBtn.disabled = false;

    }
}


/* ==========================================
   REVIEW / ORDER ACTION
========================================== */

async function reviewRequest(id, action) {

    if (actionInProgress || !adminKey) {
        return;
    }

    const validActions = [
        "approve",
        "reject",
        "in_progress",
        "complete",
        "cancel"
    ];

    if (!validActions.includes(action)) {
        return;
    }

    const requestId = Number(id);

    if (
        !Number.isSafeInteger(requestId) ||
        requestId <= 0
    ) {
        alert("Invalid request ID.");
        return;
    }

    const messages = {

        approve: "Approve this request?",

        reject: "Reject this request?",

        in_progress: "Start this service request?",

        complete: "Mark this request as Completed?",

        cancel:
            "Cancel this Pending request? This action cannot be undone here."

    };

    if (!confirm(messages[action])) {
        return;
    }

    actionInProgress = true;

    setActionButtonsDisabled(true);

    try {

        const result = await apiRequest(
            "/api/admin-review",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": adminKey
                },

                body: JSON.stringify({
                    id: requestId,
                    action: action
                })
            }
        );

        const { response, data } = result;

        if (response.status === 401) {

            invalidateSession();

            return;
        }

        if (!response.ok || data.success !== true) {

            alert(
                data.error || "Failed to update request."
            );

            return;
        }

        const successMessages = {

            approve: "Request approved successfully.",

            reject: "Request rejected successfully.",

            in_progress: "Request is now In Progress.",

            complete: "Request marked as Completed.",

            cancel: "Request cancelled successfully."

        };

        alert(successMessages[action]);

        await loadRequests();

    } catch (error) {

        console.error(error);

        alert(error.message || "Connection error. Please try again.");

    } finally {

        actionInProgress = false;

        setActionButtonsDisabled(false);

    }
}


/* ==========================================
   ACTION BUTTON LOCK
========================================== */

function setActionButtonsDisabled(disabled) {

    const buttons =
        requestsContainer.querySelectorAll("button[data-action]");

    buttons.forEach(button => {
        button.disabled = disabled;
    });
}


/* ==========================================
   EVENT DELEGATION
========================================== */

requestsContainer.addEventListener(
    "click",
    function(event) {

        const button =
            event.target.closest("button[data-action]");

        if (!button || button.disabled) {
            return;
        }

        const id = button.dataset.id;

        const action = button.dataset.action;

        reviewRequest(id, action);

    }
);


/* ==========================================
   LOGOUT
========================================== */

function logout() {

    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    adminKey = "";

    adminKeyInput.value = "";

    loginMessage.innerHTML = "";

    requestsContainer.innerHTML = "";

    totalCount.textContent = "0";

    showLogin();
}


/* ==========================================
   EVENTS
========================================== */

loginBtn.addEventListener("click", login);

logoutBtn.addEventListener("click", logout);

refreshBtn.addEventListener("click", loadRequests);

adminKeyInput.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {
            login();
        }

    }
);


/* ==========================================
   RESTORE ADMIN SESSION
========================================== */

async function restoreAdminSession() {

    if (!adminKey) {

        showLogin();

        return;
    }

    loginMessage.innerHTML =
        '<div class="message">Checking admin session...</div>';

    try {

        const result = await apiRequest(
            "/api/admin-requests",
            {
                method: "GET",
                headers: {
                    "x-admin-key": adminKey
                }
            }
        );

        const { response, data } = result;

        if (
            response.ok &&
            data.success === true &&
            Array.isArray(data.requests)
        ) {

            showAdmin();

            return;
        }

    } catch (error) {

        console.error(error);

    }

    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    adminKey = "";

    showLogin();

    loginMessage.innerHTML =
        '<div class="error">Please login again.</div>';
}


/* ==========================================
   START
========================================== */

restoreAdminSession();
