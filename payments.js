"use strict";

        // ======================================
        // DISPLAY REQUEST ID
        // ======================================

        const params = new URLSearchParams(
            window.location.search
        );

        const requestId = params.get("request_id");

        const validRequestId =
            requestId &&
            /^[1-9][0-9]*$/.test(requestId) &&
            Number.isSafeInteger(Number(requestId));

        if (validRequestId) {

            const requestInfo =
                document.getElementById("requestInfo");

            const requestDisplay =
                document.getElementById("requestIdDisplay");

            if (requestInfo) {
                requestInfo.style.display = "block";
            }

            if (requestDisplay) {
                requestDisplay.textContent =
                    "Request #" + requestId;
            }

        }

        // ======================================
        // REFRESH TRANSACTIONS
        // ======================================

        const refreshButton =
            document.getElementById(
                "refreshTransactionsBtn"
            );

        if (refreshButton) {

            refreshButton.addEventListener(
                "click",
                async function () {

                    if (
                        typeof window.loadTransactions !==
                        "function"
                    ) {
                        return;
                    }

                    refreshButton.disabled = true;

                    refreshButton.textContent =
                        "Refreshing...";

                    try {

                        await window.loadTransactions();

                    } catch (error) {

                        console.error(
                            "Transaction refresh failed:",
                            error
                        );

                        const container =
                            document.getElementById(
                                "transactions"
                            );

                        if (container) {

                            container.replaceChildren();

                            const message =
                                document.createElement("p");

                            message.className = "error";

                            message.textContent =
                                error.message ||
                                "Unable to refresh transactions.";

                            container.appendChild(message);
                        }

                    } finally {

                        refreshButton.disabled = false;

                        refreshButton.textContent =
                            "🔄 Refresh Transactions";
                    }
                }
            );
        }
