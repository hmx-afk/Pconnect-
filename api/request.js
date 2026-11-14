import { verifyPiToken } from "../lib/verifyPi.js";

// ==========================================
// PConnect - Secure Service Request API
// Pi Identity Verification | Supabase
// Testnet
// ==========================================

const REQUEST_TIMEOUT = 12000;

const ALLOWED_SERVICES = [
    "Web Development",
    "Graphic Design",
    "Content Writing",
    "Digital Marketing",
    "Tech Support"
];


// ==========================================
// RESPONSE HELPER
// ==========================================

function send(res, status, data) {
    return res.status(status).json(data);
}


// ==========================================
// FETCH WITH TIMEOUT
// ==========================================

async function fetchWithTimeout(url, options = {}) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
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
// MAIN HANDLER
// ==========================================

export default async function handler(req, res) {

    // ==========================================
    // ONLY POST
    // ==========================================

    if (req.method !== "POST") {

        res.setHeader("Allow", "POST");

        return send(res, 405, {
            success: false,
            error: "Method not allowed"
        });

    }


    try {

        // ==========================================
        // ENVIRONMENT VARIABLES
        // ==========================================

        const supabaseUrl =
            String(process.env.SUPABASE_URL || "")
                .trim()
                .replace(/\/+$/, "");

        const supabaseSecretKey =
            String(process.env.SUPABASE_SECRET_KEY || "")
                .trim();


        if (
            !supabaseUrl ||
            !supabaseSecretKey
        ) {

            console.error(
                "Missing Supabase configuration"
            );

            return send(res, 500, {
                success: false,
                error: "Server configuration error"
            });

        }


        // ==========================================
        // VALIDATE SUPABASE URL
        // ==========================================

        let parsedSupabaseUrl;

        try {
            parsedSupabaseUrl = new URL(supabaseUrl);
        } catch {
            return send(res, 500, {
                success: false,
                error: "Server configuration error"
            });
        }

        if (
            parsedSupabaseUrl.protocol !== "https:" ||
            !/^[a-z0-9-]+\.supabase\.co$/i.test(
                parsedSupabaseUrl.hostname
            ) ||
            parsedSupabaseUrl.port ||
            parsedSupabaseUrl.username ||
            parsedSupabaseUrl.password ||
            parsedSupabaseUrl.pathname !== "/" ||
            parsedSupabaseUrl.search ||
            parsedSupabaseUrl.hash
        ) {
            return send(res, 500, {
                success: false,
                error: "Server configuration error"
            });
        }

        // ==========================================
        // READ REQUEST BODY
        // ==========================================

        let body = req.body || {};

        if (typeof body === "string") {

            try {

                body = JSON.parse(body);

            } catch {

                return send(res, 400, {
                    success: false,
                    error: "Invalid request body"
                });

            }

        }


        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {

            return send(res, 400, {
                success: false,
                error: "Invalid request body"
            });

        }


        // ==========================================
        // READ INPUTS
        // ==========================================

        const service =
            typeof body.service === "string"
                ? body.service.trim()
                : "";

        const name =
            typeof body.name === "string"
                ? body.name.trim()
                : "";

        const contact =
            typeof body.contact === "string"
                ? body.contact.trim()
                : "";

        const details =
            typeof body.details === "string"
                ? body.details.trim()
                : "";

        const accessToken =
            typeof body.accessToken === "string"
                ? body.accessToken.trim()
                : "";


        // ==========================================
        // REQUIRED FIELDS
        // ==========================================

        if (
            !service ||
            !name ||
            !contact ||
            !details ||
            !accessToken
        ) {

            return send(res, 400, {
                success: false,
                error: "Please complete all required fields"
            });

        }


        // ==========================================
        // SERVICE VALIDATION
        // ==========================================

        if (
            !ALLOWED_SERVICES.includes(service)
        ) {

            return send(res, 400, {
                success: false,
                error: "Selected service is not available"
            });

        }


        // ==========================================
        // INPUT LENGTH VALIDATION
        // ==========================================

        if (
            name.length < 2 ||
            name.length > 100
        ) {

            return send(res, 400, {
                success: false,
                error: "Name must be between 2 and 100 characters"
            });

        }


        if (
            contact.length < 3 ||
            contact.length > 150
        ) {

            return send(res, 400, {
                success: false,
                error: "Contact must be between 3 and 150 characters"
            });

        }


        if (
            details.length < 10 ||
            details.length > 2000
        ) {

            return send(res, 400, {
                success: false,
                error: "Project details must be between 10 and 2000 characters"
            });

        }


        // ==========================================
        // SHARED PI IDENTITY VERIFICATION
        // ==========================================

        const identity = await verifyPiToken(accessToken);

        if (!identity.ok) {
            return send(res, identity.status, {
                success: false,
                error: identity.error
            });
        }

        const piUsername = identity.username;

        // ==========================================
        // CREATE REQUEST IN SUPABASE
          // ==========================================

        let supabaseResponse;

        try {

            const insertUrl =
                `${parsedSupabaseUrl.origin}/rest/v1/requests` +
                "?select=id,service,status,review_status,order_status,created_at";

            supabaseResponse =
                await fetchWithTimeout(
                    insertUrl,
                    {
                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "apikey":
                                supabaseSecretKey,

                            "Authorization":
                                `Bearer ${supabaseSecretKey}`,

                            "Prefer":
                                "return=representation"

                        },

                        body: JSON.stringify({

                            service: service,

                            name: name,

                            contact: contact,

                            details: details,

                            // Verified by Pi Server.
                            pi_username: piUsername,

                            payment: "Pi Network",

                            status: "Submitted",

                            review_status: "Waiting for review",

                            order_status: "Pending"

                        })

                    }
                );

        } catch (error) {

            console.error(
                "Supabase request timed out or failed:",
                error.name
            );

            return send(res, 503, {
                success: false,
                error: "Request service is temporarily unavailable. Please try again."
            });

        }


        // ==========================================
        // READ SUPABASE RESPONSE
        // ==========================================

        let savedRequest = null;

        try {

            savedRequest =
                await supabaseResponse.json();

        } catch {

            savedRequest = null;

        }


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (
            !supabaseResponse.ok ||
            !Array.isArray(savedRequest) ||
            !savedRequest[0]
        ) {

            console.error(
                "Supabase request creation failed:",
                supabaseResponse.status,
                savedRequest
            );

            return send(res, 500, {
                success: false,
                error: "Unable to save your request. Please try again."
            });

        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return send(res, 201, {

            success: true,

            message:
                "Request submitted successfully",

            request:
                savedRequest[0]

        });


    } catch (error) {

        console.error(
            "Request API error:",
            error
        );

        return send(res, 500, {
            success: false,
            error: "Internal server error"
        });

    }

}
