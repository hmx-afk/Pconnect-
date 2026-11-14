// ==========================================
// PConnect - Pi-Verified My Requests
// Testnet | Secure Authentication
// ==========================================

let piAccessToken = "";
let piUsername = "";
let isLoading = false;
let piInitialized = false;

const AUTH_TIMEOUT_MS = 15000;

const container = document.getElementById("requestsContainer");
const refreshButton = document.getElementById("refreshButton");

// ==========================================
// Escape HTML
// ==========================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// Review Status Class
// ==========================================

function reviewStatusClass(status) {

    const value = String(status || "")
        .trim()
        .toLowerCase();

    if (value === "approved") {
        return "approved";
    }

    if (value === "rejected") {
        return "rejected";
    }

    return "waiting";
}

// ==========================================
// Order Status Class
// ==========================================

function orderStatusClass(status) {

    const value = String(status || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    if (value === "paid") return "paid";

    if (value === "in_progress") return "progress";

    if (value === "completed") return "completed";

    if (value === "cancelled") return "cancelled";

    return "pending";
}

// ==========================================
// Get Order Status
// ==========================================

function getOrderStatus(request) {

    return request.order_status ||
        request.orderStatus ||
        "Pending";
}

// ==========================================
// Timeout Helper
// ==========================================

function withTimeout(promise, ms, message) {

    let timer;

    const timeout = new Promise(function (_, reject) {

        timer = setTimeout(function () {

            reject(new Error(message));

        }, ms);

    });

    return Promise.race([promise, timeout])
        .finally(function () {

            clearTimeout(timer);

        });
}

// ==========================================
// Pi Authentication
// ==========================================

async function authenticatePi() {

    if (typeof Pi === "undefined") {

        throw new Error(
            "Pi SDK is unavailable. Please open PConnect in Pi Browser and try again."
        );

    }

    if (!piInitialized) {

        Pi.init({
            version: "2.0",
            sandbox: true
        });

        piInitialized = true;

    }

    const auth = await withTimeout(

        Pi.authenticate(["username"]),

        AUTH_TIMEOUT_MS,

        "Pi sign-in timed out. Please tap Refresh and accept the Pi permission prompt."

    );

    if (
        !auth ||
        !auth.accessToken ||
        !auth.user ||
        !auth.user.username
    ) {

        throw new Error(
            "Pi authentication was not completed. Please sign in again."
        );

    }

    // Keep token in memory only.

    piAccessToken = auth.accessToken;

    piUsername = auth.user.username;

    return piUsername;
}

// ==========================================
// Load Requests
// ==========================================

async function loadRequests() {

    if (isLoading) return;

    isLoading = true;

    refreshButton.disabled = true;

    container.innerHTML = `
        <div class="loading">
            Verifying Pi account and loading requests...
        </div>
    `;

    try {

        // Authenticate Pi user.

        await authenticatePi();

        // Fetch requests from secure API.

        const response = await fetch("/api/my-requests", {

            method: "GET",

            cache: "no-store",

            headers: {

                "Authorization": "Bearer " + piAccessToken,

                "Accept": "application/json"

            }

        });

        let result;

        try {

            result = await response.json();

        } catch {

            throw new Error(
                "Invalid server response. Please try again."
            );

        }

        if (!response.ok || !result.success) {

            if (response.status === 401) {

                piAccessToken = "";

                piUsername = "";

                throw new Error(
                    "Pi authentication failed. Please reopen this page and sign in again."
                );

            }

            throw new Error(
                result.error || "Failed to load requests."
            );

        }

        const requests = Array.isArray(result.requests)
            ? result.requests
            : [];

        const verifiedUsername =
            result.user && result.user.username;

        // Verify server identity matches Pi identity.

        if (
            !verifiedUsername ||
            verifiedUsername !== piUsername
        ) {

            throw new Error(
                "The verified Pi account did not match. Please sign in again."
            );

        }

        // No requests found.

        if (requests.length === 0) {

            container.innerHTML = `
                <div class="empty">

                    <h3>No requests yet</h3>

                    <p style="margin-top:10px;">
                        You have not submitted any service requests.
                    </p>

                    <a href="browse.html" class="pay-button">
                        🔎 Browse Services
                    </a>

                </div>
            `;

            return;

        }

        // Render requests.

        container.innerHTML = requests.map(function (request) {

            const reviewStatus =
                request.review_status || "Waiting";

            const orderStatus =
                getOrderStatus(request);

            const payment =
                request.payment || "Pending";

            const normalizedOrderStatus =
                String(orderStatus)
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "_");

            const isApproved =
                String(reviewStatus)
                    .trim()
                    .toLowerCase() === "approved";

            const isPaid =
                normalizedOrderStatus === "paid";

            const isInProgress =
                normalizedOrderStatus === "in_progress";

            const isCompleted =
                normalizedOrderStatus === "completed";

            const isCancelled =
                normalizedOrderStatus === "cancelled";

            let action = "";

            // Payment button only for approved unpaid requests.

            if (
                isApproved &&
                !isPaid &&
                !isInProgress &&
                !isCompleted &&
                !isCancelled
            ) {

                action = `
                    <a
                        href="payments.html?request_id=${encodeURIComponent(String(request.id ?? ""))}"
                        class="pay-button"
                    >
                        💳 Pay 0.01 π
                    </a>
                `;

            } else if (isPaid) {

                action = `
                    <div
                        class="status paid"
                        style="margin-top:15px;margin-bottom:0;"
                    >
                        ✅ Paid
                    </div>
                `;

            } else if (isInProgress) {

                action = `
                    <div
                        class="status progress"
                        style="margin-top:15px;margin-bottom:0;"
                    >
                        🔵 Order In Progress
                    </div>
                `;

            } else if (isCompleted) {

                action = `
                    <div
                        class="status completed"
                        style="margin-top:15px;margin-bottom:0;"
                    >
                        🟢 Completed
                    </div>
                `;

            } else if (isCancelled) {

                action = `
                    <div
                        class="status cancelled"
                        style="margin-top:15px;margin-bottom:0;"
                    >
                        ⚪ Cancelled
                    </div>
                `;

            }

            return `

                <article class="card">

                    <div class="service-title">
                        💻 ${escapeHtml(request.service || "Service")}
                    </div>

                    <div class="request-id">

                        Request ID:

                        <strong>
                            #${escapeHtml(request.id)}
                        </strong>

                    </div>

                    <div>

                        <span class="status ${reviewStatusClass(reviewStatus)}">

                            Review: ${escapeHtml(reviewStatus)}

                        </span>

                        <span class="status ${orderStatusClass(orderStatus)}">

                            Order: ${escapeHtml(orderStatus)}

                        </span>

                    </div>

                    <p class="details">

                        <strong>Name:</strong>

                        ${escapeHtml(request.name)}

                        <br><br>

                        <strong>Contact:</strong>

                        ${escapeHtml(request.contact)}

                        <br><br>

                        <strong>Project Details:</strong>

                        ${escapeHtml(request.details)}

                        <br><br>

                        <strong>Payment:</strong>

                        ${escapeHtml(payment)}

                        <br><br>

                        <strong>Submitted:</strong>

                        ${escapeHtml(
                            request.created_at
                                ? new Date(request.created_at).toLocaleString()
                                : "N/A"
                        )}

                    </p>

                    ${action}

                </article>

            `;

        }).join("");

    } catch (error) {

        console.error(
            "Load requests error:",
            error
        );

        container.innerHTML = `

            <div class="error">

                <h3>⚠️ Failed to Load Requests</h3>

                <p style="margin-top:10px;">

                    ${escapeHtml(
                        error.message || "Please try again."
                    )}

                </p>

                <p style="margin-top:10px;">

                    Check that you are using Pi Browser and that Pi sign-in is available.

                </p>

            </div>

        `;

    } finally {

        isLoading = false;

        refreshButton.disabled = false;

    }

}

// ==========================================
// Refresh Button
// ==========================================

refreshButton.addEventListener(
    "click",
    loadRequests
);

// ==========================================
// Initial Load
// ==========================================

loadRequests();
