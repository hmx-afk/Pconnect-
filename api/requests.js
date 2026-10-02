import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

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


    if (!supabaseUrl) {

        console.error(
            "Missing SUPABASE_URL"
        );

        return res.status(500).json({
            success: false,
            error: "SUPABASE_URL is not configured"
        });

    }


    if (!supabaseSecretKey) {

        console.error(
            "Missing SUPABASE_SECRET_KEY"
        );

        return res.status(500).json({
            success: false,
            error: "SUPABASE_SECRET_KEY is not configured"
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
    // GET REQUESTS
    // ==========================================

    const {
        data,
        error
    } = await supabase
        .from("requests")
        .select("*")
        .order(
            "created_at",
            {
                ascending: false
            }
        );


    if (error) {

        console.error(
            "Supabase requests error:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Failed to load requests"
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
        "requests API error:",
        err
    );


    return res.status(500).json({

        success: false,

        error:
            err?.message ||
            "Failed to load requests"

    });

}

}
