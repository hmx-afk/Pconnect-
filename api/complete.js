// ==========================================
// PConnect - Complete Pi Payment
// ==========================================

export default async function handler(req, res) {

    try {

        // ==========================================
        // METHOD CHECK
        // ==========================================

        if (req.method !== "POST") {

            return res.status(405).json({
                error: "Method not allowed"
            });

        }


        // ==========================================
        // REQUEST DATA
        // ==========================================

        const {
            paymentId,
            txid,
            amount = 0.01,
            pi_username = null,
            request_id = null
        } = req.body || {};


        // ==========================================
        // BASIC VALIDATION
        // ==========================================

        if (!paymentId) {

            return res.status(400).json({
                error: "Missing paymentId"
            });

        }


        if (!txid) {

            return res.status(400).json({
                error: "Missing txid"
            });

        }


        if (
            request_id === null ||
            request_id === undefined ||
            request_id === ""
        ) {

            return res.status(400).json({
                error: "Missing request_id"
            });

        }


        // ==========================================
        // VALIDATE REQUEST ID
        // ==========================================

        const parsedRequestId =
            Number(request_id);


        if (
            !Number.isInteger(parsedRequestId) ||
            parsedRequestId <= 0
        ) {

            return res.status(400).json({
                error: "Invalid request_id"
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
                error:
                    "Server configuration error"
            });

        }


        const supabaseHeaders = {

            "Content-Type":
                "application/json",

            "apikey":
                supabaseSecretKey,

            "Authorization":
                `Bearer ${supabaseSecretKey}`

        };


        // ==========================================
        // 1. VERIFY APPROVED REQUEST
        // ==========================================

        const requestResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedRequestId)}&select=id,service,review_status,order_status`,

                {
                    method: "GET",
                    headers:
                        supabaseHeaders
                }

            );


        const requestData =
            await requestResponse.json();


        if (!requestResponse.ok) {

            console.error(
                "Request verification error:",
                requestData
            );

            return res.status(500).json({
                error:
                    "Could not verify service request"
            });

        }


        if (
            !requestData ||
            requestData.length === 0
        ) {

            return res.status(404).json({
                error:
                    "Service request not found"
            });

        }


        const approvedRequest =
            requestData[0];


        // ==========================================
        // APPROVAL CHECK
        // ==========================================

        if (
            approvedRequest.review_status !==
            "Approved"
        ) {

            return res.status(403).json({
                error:
                    "This service request has not been approved"
            });

        }


        // ==========================================
        // SERVER CONTROLLED SERVICE
        // ==========================================

        const service =
            approvedRequest.service ||
            "Web Development";


        // ==========================================
        // 2. DUPLICATE PAYMENT CHECK
        // ==========================================

        const duplicateResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${encodeURIComponent(paymentId)}&select=*`,

                {
                    method: "GET",
                    headers:
                        supabaseHeaders
                }

            );


        const duplicateData =
            await duplicateResponse.json();


        if (!duplicateResponse.ok) {

            console.error(
                "Duplicate transaction check error:",
                duplicateData
            );

            return res.status(500).json({
                error:
                    "Could not verify existing transaction"
            });

        }


        // ==========================================
        // ALREADY COMPLETED
        // ==========================================

        if (
            duplicateData &&
            duplicateData.length > 0
        ) {

            // ------------------------------------------
            // Make sure linked request is marked Paid
            // ------------------------------------------

            const paidRequestResponse =
                await fetch(

                    `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedRequestId)}`,

                    {
                        method: "PATCH",

                        headers: {

                            ...supabaseHeaders,

                            "Prefer":
                                "return=representation"

                        },

                        body: JSON.stringify({

                            order_status:
                                "Paid"

                        })

                    }

                );


            const paidRequestData =
                await paidRequestResponse.json();


            if (!paidRequestResponse.ok) {

                console.error(
                    "Request Paid status update error:",
                    paidRequestData
                );

                return res.status(500).json({

                    error:
                        "Payment already completed, but request status could not be updated",

                    transaction:
                        duplicateData[0]

                });

            }


            return res.status(200).json({

                success:
                    true,

                alreadyCompleted:
                    true,

                message:
                    "Payment was already completed",

                transaction:
                    duplicateData[0],

                request:
                    paidRequestData[0]

            });

        }


        // ==========================================
        // 3. COMPLETE PAYMENT WITH PI
        // ==========================================

        const piApiKey =
            process.env.PI_API_KEY;


        if (!piApiKey) {

            console.error(
                "Missing PI_API_KEY"
            );

            return res.status(500).json({
                error:
                    "Server configuration error"
            });

        }


        const piResponse =
            await fetch(

                `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`,

                {
                    method: "POST",

                    headers: {

                        "Authorization":
                            `Key ${piApiKey}`,

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({
                        txid:
                            txid
                    })

                }

            );


        const piData =
            await piResponse.json();


        if (!piResponse.ok) {

            console.error(
                "Pi completion error:",
                piData
            );

            return res.status(
                piResponse.status
            ).json({

                error:
                    "Pi payment completion failed",

                details:
                    piData

            });

        }


        // ==========================================
        // 4. SAVE TRANSACTION
        // ==========================================

        const supabaseResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/transactions`,

                {
                    method: "POST",

                    headers: {

                        ...supabaseHeaders,

                        "Prefer":
                            "return=representation"

                    },

                    body: JSON.stringify({

                        payment_id:
                            paymentId,

                        txid:
                            txid,

                        amount:
                            amount,

                        currency:
                            "Pi",

                        pi_username:
                            pi_username,

                        service:
                            service,

                        status:
                            "Completed",

                        request_id:
                            parsedRequestId

                    })

                }

            );


        const supabaseData =
            await supabaseResponse.json();


        // ==========================================
        // UNIQUE PAYMENT CONFLICT
        // ==========================================

        if (
            !supabaseResponse.ok &&
            supabaseData &&
            supabaseData.code === "23505"
        ) {

            console.warn(
                "Duplicate payment prevented by database:",
                paymentId
            );


            const existingResponse =
                await fetch(

                    `${supabaseUrl}/rest/v1/transactions?payment_id=eq.${encodeURIComponent(paymentId)}&select=*`,

                    {
                        method: "GET",
                        headers:
                            supabaseHeaders
                    }

                );


            const existingData =
                await existingResponse.json();


            if (
                existingResponse.ok &&
                existingData &&
                existingData.length > 0
            ) {

                // ------------------------------------------
                // Mark linked request as Paid
                // ------------------------------------------

                const paidRequestResponse =
                    await fetch(

                        `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedRequestId)}`,

                        {
                            method: "PATCH",

                            headers: {

                                ...supabaseHeaders,

                                "Prefer":
                                    "return=representation"

                            },

                            body: JSON.stringify({

                                order_status:
                                    "Paid"

                            })

                        }

                    );


                const paidRequestData =
                    await paidRequestResponse.json();


                if (!paidRequestResponse.ok) {

                    console.error(
                        "Request Paid status update error:",
                        paidRequestData
                    );

                    return res.status(500).json({

                        error:
                            "Payment was completed, but request status could not be updated",

                        transaction:
                            existingData[0]

                    });

                }


                return res.status(200).json({

                    success:
                        true,

                    alreadyCompleted:
                        true,

                    message:
                        "Payment was already completed",

                    transaction:
                        existingData[0],

                    request:
                        paidRequestData[0]

                });

            }


            return res.status(409).json({

                success:
                    false,

                error:
                    "Duplicate payment detected"

            });

        }


        // ==========================================
        // OTHER SUPABASE ERROR
        // ==========================================

        if (!supabaseResponse.ok) {

            console.error(
                "Transaction save error:",
                supabaseData
            );

            return res.status(500).json({

                error:
                    "Payment completed, but transaction could not be saved",

                details:
                    supabaseData

            });

        }


        // ==========================================
        // 5. UPDATE REQUEST ORDER STATUS
        // ==========================================

        const orderStatusResponse =
            await fetch(

                `${supabaseUrl}/rest/v1/requests?id=eq.${encodeURIComponent(parsedRequestId)}`,

                {
                    method: "PATCH",

                    headers: {

                        ...supabaseHeaders,

                        "Prefer":
                            "return=representation"

                    },

                    body: JSON.stringify({

                        order_status:
                            "Paid"

                    })

                }

            );


        const orderStatusData =
            await orderStatusResponse.json();


        if (!orderStatusResponse.ok) {

            console.error(
                "Order status update error:",
                orderStatusData
            );

            return res.status(500).json({

                error:
                    "Payment completed and transaction saved, but request status could not be updated",

                transaction:
                    supabaseData[0],

                details:
                    orderStatusData

            });

        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success:
                true,

            message:
                "Payment completed, transaction saved, and request marked as Paid",

            payment:
                piData,

            transaction:
                supabaseData[0],

            request:
                orderStatusData[0]

        });


    } catch (error) {

        console.error(
            "Complete error:",
            error
        );

        return res.status(500).json({

            error:
                "Internal server error",

            details:
                error.message

        });

    }

}
