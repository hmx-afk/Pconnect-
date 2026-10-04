// ==========================================
// PConnect - Admin Review & Order Status API
// ==========================================

export default async function handler(req, res) {

    try {

        // ==========================================
        // ONLY POST
        // ==========================================

        if (req.method !== "POST") {

            return res.status(405).json({
                success: false,
                error: "Method not allowed"
            });

        }


        // ==========================================
        // ADMIN AUTHENTICATION
        // ==========================================

        const adminKey =
            req.headers["x-admin-key"];

        const correctAdminKey =
            process.env.ADMIN_REVIEW_KEY;


        if (!correctAdminKey) {

            console.error(
                "Missing ADMIN_REVIEW_KEY"
            );

            return res.status(500).json({
                success: false,
                error:
                    "Admin authentication is not configured"
            });

        }


        if (
            !adminKey ||
            adminKey !== correctAdminKey
        ) {

            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });

        }


        // ==========================================
        // REQUEST DATA
        // ==========================================

        const {
            id,
            action
        } = req.body || {};


        // ==========================================
        // VALIDATE REQUEST ID
        // ==========================================

        const parsedId =
            Number(id);


        if (
            !Number.isInteger(parsedId) ||
            parsedId <= 0
        ) {

            return res.status(400).json({
                success: false,
                error: "Invalid request id"
            });

        }


        // ==========================================
        // VALID ACTIONS
        // ==========================================

        const validActions = [
            "approve",
            "reject",
            "in_progress",
            "complete",
            "cancel"
        ];


        if (!validActions.includes(action)) {

            return res.status(400).json({
                success: false,
                error: "Invalid action"
            });

        }


        // ==========================================
        // SUPABASE CONFIG
        // ==========================================

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;


        if (
            !supabaseUrl ||
            !supabaseSecretKey
        ) {

            console.error(
                "Missing Supabase environment variables"
            );

            return res.status(500).json({
                success: false,
                error:
                    "Server configuration error"
            });

        }


        const headers = {

            "Content-Type":
                "application/json",

            "apikey":
                supabaseSecretKey,

            "Authorization":
                `Bearer ${supabaseSecretKey}`

        };


        // ==========================================
        // GET CURRENT REQUEST
        // ==========================================

        const requestResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedId)}&select=*`,

                {
                    method: "GET",
                    headers
                }

            );


        const requestData =
            await requestResponse.json();


        if (!requestResponse.ok) {

            console.error(
                "Request fetch error:",
                requestData
            );

            return res.status(500).json({
                success: false,
                error:
                    "Failed to load request",
                details:
                    requestData
            });

        }


        if (
            !requestData ||
            requestData.length === 0
        ) {

            return res.status(404).json({
                success: false,
                error:
                    "Request not found"
            });

        }


        const request =
            requestData[0];


        // ==========================================
        // APPROVE
        // ==========================================

        if (action === "approve") {

            const response =
                await fetch(

                    `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedId)}`,

                    {
                        method: "PATCH",

                        headers: {
                            ...headers,
                            "Prefer":
                                "return=representation"
                        },

                        body: JSON.stringify({

                            review_status:
                                "Approved"

                        })

                    }

                );


            const data =
                await response.json();


            if (!response.ok) {

                console.error(
                    "Approve error:",
                    data
                );

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        "Failed to approve request",

                    details:
                        data

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Request approved successfully",

                request:
                    data[0]

            });

        }


        // ==========================================
        // REJECT
        // ==========================================

        if (action === "reject") {

            const response =
                await fetch(

                    `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedId)}`,

                    {
                        method: "PATCH",

                        headers: {
                            ...headers,
                            "Prefer":
                                "return=representation"
                        },

                        body: JSON.stringify({

                            review_status:
                                "Rejected"

                        })

                    }

                );


            const data =
                await response.json();


            if (!response.ok) {

                console.error(
                    "Reject error:",
                    data
                );

                return res.status(
                    response.status
                ).json({

                    success: false,

                    error:
                        "Failed to reject request",

                    details:
                        data

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Request rejected successfully",

                request:
                    data[0]

            });

        }


        // ==========================================
        // ORDER STATUS ACTIONS
        // ==========================================

        const currentOrderStatus =
            request.order_status ||
            "Pending";


        let newOrderStatus = null;


        if (action === "in_progress") {

            if (
                currentOrderStatus !==
                "Paid"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Request must be Paid before it can be marked In Progress"

                });

            }

            newOrderStatus =
                "In Progress";

        }


        if (action === "complete") {

            if (
                currentOrderStatus !==
                "In Progress"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Request must be In Progress before it can be Completed"

                });

            }

            newOrderStatus =
                "Completed";

        }


        if (action === "cancel") {

            if (
                currentOrderStatus ===
                "Completed"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Completed requests cannot be cancelled"

                });

            }

            newOrderStatus =
                "Cancelled";

        }


        // ==========================================
        // UPDATE ORDER STATUS
        // ==========================================

        const statusResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedId)}`,

                {
                    method: "PATCH",

                    headers: {
                        ...headers,
                        "Prefer":
                            "return=representation"
                    },

                    body: JSON.stringify({

                        order_status:
                            newOrderStatus

                    })

                }

            );


        const statusData =
            await statusResponse.json();


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (!statusResponse.ok) {

            console.error(
                "Order status update error:",
                statusData
            );

            return res.status(
                statusResponse.status
            ).json({

                success: false,

                error:
                    "Failed to update order status",

                details:
                    statusData

            });

        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success: true,

            message:
                `Request marked as ${newOrderStatus}`,

            request:
                statusData[0]

        });


    } catch (error) {

        console.error(
            "Admin review API error:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                "Internal server error",

            details:
                error.message

        });

    }

}
