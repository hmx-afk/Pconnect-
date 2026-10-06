import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

    // ==========================================
    // CACHE CONTROL
    // ==========================================

    res.setHeader("Cache-Control", "no-store");


    // ==========================================
    // METHOD CHECK
    // ==========================================

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }


    try {

        // ==========================================
        // ENVIRONMENT VARIABLES
        // ==========================================

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseSecretKey =
            process.env.SUPABASE_SECRET_KEY;


        if (!supabaseUrl || !supabaseSecretKey) {

            console.error(
                "Missing Supabase environment variables"
            );

            return res.status(500).json({
                success: false,
                error: "Server configuration error"
            });

        }


        // ==========================================
        // PI USERNAME
        // ==========================================

        const piUsername =
            String(
                req.query?.pi_username || ""
            ).trim();


        if (!piUsername) {

            return res.status(401).json({
                success: false,
                error: "Pi username is required"
            });

        }


        // ==========================================
        // SUPABASE CLIENT
        // ==========================================

        const supabase =
            createClient(
                supabaseUrl,
                supabaseSecretKey
            );


        // ==========================================
        // GET ONLY USER'S REQUESTS
        // ==========================================

        const {
            data,
            error
        } = await supabase
            .from("requests")
            .select("*")
            .eq("pi_username", piUsername)
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        // ==========================================
        // SUPABASE ERROR
        // ==========================================

        if (error) {

            console.error(
                "Supabase requests error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Failed to load requests"
            });

        }


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({

            success: true,

            requests:
                Array.isArray(data)
                    ? data
                    : []

        });

    } catch (err) {

        console.error(
            "Requests API error:",
            err
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });

    }

}
