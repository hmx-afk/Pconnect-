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
            service = "Web Development",
            request_id = null
        } = req.body || {};


        // ==========================================
        // VALIDATION
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


        // ==========================================
        // VALIDATE REQUEST ID
        // ==========================================

        let requestIdValue = null;

        if (
            request_id !== null &&
            request_id !== undefined &&
            request_id !== ""
        ) {

            const parsedRequestId =
                Number(request_id);

            if (
                !Number.isInteger(parsedRequestId) ||
                parsedRequestId <= 0
            ) {

                return res.status(400).json({

                    error:
                        "Invalid request_id"

                });

            }

            requestIdValue =
                parsedRequestId;

        }


        // ==========================================
        // 1. COMPLETE PAYMENT WITH PI
        // ==========================================

        const piResponse = await fetch(

            `https://api.minepi.com/v2/payments/${paymentId}/complete`,

            {

                method: "POST",

                headers: {

                    "Authorization":
                        `Key ${process.env.PI_API_KEY}`,

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify({

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
        // 2. SAVE TRANSACTION TO SUPABASE
        // ==========================================

        const supabaseResponse =
            await fetch(

                `${process.env.SUPABASE_URL}/rest/v1/transactions`,

                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "apikey":
                            process.env.SUPABASE_SECRET_KEY,

                        "Authorization":
                            `Bearer ${process.env.SUPABASE_SECRET_KEY}`,

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
                            requestIdValue

                    })

                }

            );


        const supabaseData =
            await supabaseResponse.json();


        // ==========================================
        // SUPABASE ERROR
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
        // 3. SUCCESS
        // ==========================================

        return res.status(200).json({

            success:
                true,

            message:
                "Payment completed and transaction saved",

            payment:
                piData,

            transaction:
                supabaseData[0]

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
