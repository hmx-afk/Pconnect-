loginBtn.addEventListener("click", async () => {
    status.textContent = "Connecting...";

    try {
        const scopes = ["username"];

        const authResult = await Pi.authenticate(
            scopes,
            onIncompletePaymentFound
        );

        console.log("User:", authResult.user);

        status.textContent =
            "Connected ✔️ " + authResult.user.username;

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
