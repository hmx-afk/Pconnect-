// ==========================================
    // PConnect - Secure Request Submission
    // ==========================================


    // ==========================================
    // PI SDK INITIALIZATION
    // ==========================================

    let piSdkReady = false;
    let piInitError = null;

    try {
        if (typeof window.Pi === "undefined") {
            throw new Error(
                "Pi SDK is unavailable. Please open PConnect in Pi Browser."
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
    // PAGE ELEMENTS
    // ==========================================

    const params =
        new URLSearchParams(
            window.location.search
        );


    const selectedService =
        params.get("service") ||
        "Web Development";


    const serviceName =
        document.getElementById(
            "serviceName"
        );


    const requestForm =
        document.getElementById(
            "requestForm"
        );


    const submitBtn =
        document.getElementById(
            "submitBtn"
        );


    const status =
        document.getElementById(
            "status"
        );


    serviceName.textContent =
        selectedService;


    // ==========================================
    // PI AUTHENTICATION
    // ==========================================

    let piAccessToken = null;

    let piUsername = null;


    async function authenticatePi() {

        try {

            const authResult =
                await window.Pi.authenticate(
                    ["username"],
                    function(payment) {

                        console.log(
                            "Incomplete payment:",
                            payment
                        );

                    }
                );


            if (
                !authResult ||
                !authResult.accessToken ||
                !authResult.user
            ) {

                throw new Error(
                    "Pi authentication failed."
                );

            }


            piAccessToken =
                String(
                    authResult.accessToken
                ).trim();


            piUsername =
                String(
                    authResult.user.username ||
                    ""
                ).trim();


            if (!piAccessToken) {

                throw new Error(
                    "Pi access token not available."
                );

            }


            if (piUsername) {

                sessionStorage.setItem(
                    "pconnect_pi_username",
                    piUsername
                );

            }


            return true;


        } catch (error) {

            console.error(
                "Pi authentication error:",
                error
            );

            return false;

        }

    }


    // ==========================================
    // SUBMIT REQUEST
    // ==========================================

    requestForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const name =
                document.getElementById(
                    "name"
                ).value.trim();


            const contact =
                document.getElementById(
                    "contact"
                ).value.trim();


            const details =
                document.getElementById(
                    "details"
                ).value.trim();


            // ==========================================
            // CHECK FORM
            // ==========================================

            if (
                !name ||
                !contact ||
                !details
            ) {

                status.className =
                    "status error";

                status.textContent =
                    "⚠️ Please complete all fields.";

                return;

            }


            // ==========================================
            // DISABLE BUTTON
            // ==========================================

            submitBtn.disabled = true;

            submitBtn.textContent =
                "Connecting to Pi...";


            status.className =
                "status";

            status.textContent =
                "Authenticating your Pi account...";


            try {

                // ==========================================
                // GET FRESH PI ACCESS TOKEN
                // ==========================================

                if (!piSdkReady || !window.Pi) {
                    throw new Error(
                        piInitError?.message ||
                        "Pi SDK is unavailable. Please open PConnect in Pi Browser."
                    );
                }

                const authenticated =
                    await authenticatePi();


                if (!authenticated) {

                    throw new Error(
                        "Please sign in with Pi and try again."
                    );

                }


                // ==========================================
                // SUBMIT TO SERVER
                // ==========================================

                submitBtn.textContent =
                    "Submitting...";


                status.textContent =
                    "Sending your request securely...";


                const response =
                    await fetch(
                        "/api/request",
                        {

                            method: "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    service:
                                        selectedService,

                                    name:
                                        name,

                                    contact:
                                        contact,

                                    details:
                                        details,

                                    // IMPORTANT:
                                    // We send the Pi access token.
                                    // Server verifies the identity.
                                    accessToken:
                                        piAccessToken

                                })

                        }
                    );


                const data =
                    await response.json();


                // ==========================================
                // API ERROR
                // ==========================================

                if (
                    !response.ok ||
                    data.error
                ) {

                    throw new Error(
                        data.error ||
                        "Request submission failed."
                    );

                }


                // ==========================================
                // SUCCESS
                // ==========================================

                status.className =
                    "status success";

                status.textContent =
                    "✔️ Request submitted successfully!";


                requestForm.reset();


                serviceName.textContent =
                    selectedService;


                // ==========================================
                // REDIRECT
                // ==========================================

                setTimeout(
                    function() {

                        window.location.href =
                            "/requests.html";

                    },
                    1500
                );


            } catch (error) {

                console.error(
                    "Request error:",
                    error
                );


                status.className =
                    "status error";


                status.textContent =
                    "⚠️ " +
                    error.message;


                submitBtn.disabled =
                    false;


                submitBtn.textContent =
                    "📩 Submit Request";

            }

        }
    );
