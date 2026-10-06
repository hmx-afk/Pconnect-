// ==========================================
// PConnect - Admin Review & Order Status API
// Security Patched Version
// ==========================================

import crypto from "crypto";

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
            String(
                req.headers["x-admin-key"] || ""
            );

        const correctAdminKey =
            String(
                process.env.ADMIN_REVIEW_KEY || ""
            );


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


        // ==========================================
        // TIMING-SAFE ADMIN KEY COMPARISON
        // ==========================================

        let adminKeyValid = false;

        try {

            const providedKeyBuffer =
                Buffer.from(
                    adminKey,
                    "utf8"
                );

            const correctKeyBuffer =
                Buffer.from(
                    correctAdminKey,
                    "utf8"
                );


            if (
                providedKeyBuffer.length ===
                correctKeyBuffer.length
            ) {

                adminKeyValid =
                    crypto.timingSafeEqual(
                        providedKeyBuffer,
                        correctKeyBuffer
                    );

            }

        } catch (authError) {

            console.error(
                "Admin authentication comparison error:",
                authError
            );

            adminKeyValid = false;

        }


        if (!adminKeyValid) {

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
                    "Failed to load request"
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
        // NOTIFICATION HELPER
        // ==========================================

        async function createNotification(
            type,
            title,
            message
        ) {

            const piUsername =
                String(
                    request.pi_username || ""
                ).trim();


            // ------------------------------------------
            // No Pi username
            // ------------------------------------------

            if (!piUsername) {

                console.warn(
                    `No pi_username for request #${parsedId}. Notification skipped.`
                );

                return null;

            }


            // ------------------------------------------
            // CHECK FOR EXISTING NOTIFICATION
            // Prevent duplicate notifications
            // ------------------------------------------

            try {

                const existingResponse =
                    await fetch(

                        `${supabaseUrl}/rest/v1/notifications?request_id=eq.${encodeURIComponent(parsedId)}&type=eq.${encodeURIComponent(type)}&select=id&limit=1`,

                        {
                            method: "GET",
                            headers
                        }

                    );


                const existingData =
                    await existingResponse.json();


                if (
                    existingResponse.ok &&
                    Array.isArray(existingData) &&
                    existingData.length > 0
                ) {

                    console.log(
                        `Notification already exists for request #${parsedId}: ${type}`
                    );

                    return existingData[0];

                }

            } catch (checkError) {

                console.error(
                    "Notification duplicate check error:",
                    checkError
                );

            }


            // ------------------------------------------
            // CREATE NEW NOTIFICATION
            // ------------------------------------------

            try {

                const notificationResponse =
                    await fetch(

                        `${supabaseUrl}/rest/v1/notifications`,

                        {
                            method: "POST",

                            headers: {
                                ...headers,

                                "Prefer":
                                    "return=representation"
                            },

                            body: JSON.stringify({

                                request_id:
                                    parsedId,

                                pi_username:
                                    piUsername,

                                type,

                                title,

                                message,

                                is_read:
                                    false

                            })

                        }

                    );


                const notificationData =
                    await notificationResponse.json();


                if (!notificationResponse.ok) {

                    console.error(
                        "Notification creation error:",
                        notificationData
                    );

                    return null;

                }


                return (
                    notificationData?.[0] ||
                    notificationData
                );

            } catch (notificationError) {

                console.error(
                    "Notification request error:",
                    notificationError
                );

                return null;

            }

        }


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
                        "Failed to approve request"

                });

            }


            await createNotification(
                "approved",
                "Request Approved",
                `Your request #${parsedId} has been approved.`
            );


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
                        "Failed to reject request"

                });

            }


            await createNotification(
                "rejected",
                "Request Rejected",
                `Your request #${parsedId} has been rejected.`
            );


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


        // ==========================================
        // START / IN PROGRESS
        // ==========================================

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


        // ==========================================
        // COMPLETE
        // ==========================================

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


        // ==========================================
        // CANCEL
        // ==========================================

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
                    "Failed to update order status"

            });

        }


        // ==========================================
        // IN PROGRESS NOTIFICATION
        // ==========================================

        if (action === "in_progress") {

            await createNotification(
                "in_progress",
                "Order In Progress",
                `Your order for request #${parsedId} is now in progress.`
            );

        }


        // ==========================================
        // COMPLETED NOTIFICATION
        // ==========================================

        if (action === "complete") {

            await createNotification(
                "completed",
                "Order Completed",
                `Your order for request #${parsedId} has been completed.`
            );

        }


        // ==========================================
        // CANCELLED NOTIFICATION
        // ==========================================

        if (action === "cancel") {

            await createNotification(
                "cancelled",
                "Order Cancelled",
                `Your order for request #${parsedId} has been cancelled.`
            );

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

        // ==========================================
        // SECURITY PATCH:
        // Do NOT expose server error details
        // ==========================================

        return res.status(500).json({

            success: false,

            error:
                "Internal server error"

        });

    }

}
