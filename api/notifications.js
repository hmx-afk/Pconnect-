// ==========================================
// PConnect - Notifications API
// Security Patched Version
// ==========================================

import crypto from "crypto";

function isAdmin(req) {

  const key =
    String(
      req.headers["x-admin-key"] || ""
    );

  const secret =
    String(
      process.env.ADMIN_REVIEW_KEY || ""
    );

  if (!key || !secret) {
    return false;
  }

  const a =
    Buffer.from(key, "utf8");

  const b =
    Buffer.from(secret, "utf8");

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );

}


export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );


  try {

    // ==========================================
    // SUPABASE CONFIG
    // ==========================================

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const key =
      process.env.SUPABASE_SECRET_KEY;


    if (
      !supabaseUrl ||
      !key
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


    const endpoint =
      `${supabaseUrl}/rest/v1/notifications`;


    const requestsEndpoint =
      `${supabaseUrl}/rest/v1/requests`;


    const headers = {

      apikey:
        key,

      Authorization:
        `Bearer ${key}`,

      "Content-Type":
        "application/json"

    };


    // ==========================================
    // GET
    // ==========================================

    if (req.method === "GET") {

      const piUsername =
        String(
          req.query?.pi_username || ""
        )
        .trim()
        .slice(0, 100);


      if (!piUsername) {

        return res.status(400).json({
          success: false,
          error:
            "pi_username is required"
        });

      }


      const r =
        await fetch(

          `${endpoint}?select=*&pi_username=eq.${encodeURIComponent(piUsername)}&order=created_at.desc&limit=50`,

          {
            headers
          }

        );


      const data =
        await r.json();


      if (!r.ok) {

        console.error(
          "Notifications GET error:",
          data
        );

        return res.status(500).json({
          success: false,
          error:
            "Failed to load notifications"
        });

      }


      return res.status(200).json({

        success: true,

        notifications:
          Array.isArray(data)
            ? data
            : []

      });

    }


    // ==========================================
    // POST - ADMIN ONLY
    // ==========================================

    if (req.method === "POST") {

      if (!isAdmin(req)) {

        return res.status(401).json({
          success: false,
          error:
            "Unauthorized"
        });

      }


      const body =
        req.body || {};


      const requestId =
        Number(
          body.request_id
        );


      const requestedPiUsername =
        String(
          body.pi_username || ""
        )
        .trim()
        .slice(0, 100);


      const type =
        String(
          body.type || ""
        )
        .trim()
        .slice(0, 50);


      const title =
        String(
          body.title || ""
        )
        .trim()
        .slice(0, 200);


      const message =
        String(
          body.message || ""
        )
        .trim()
        .slice(0, 1000);


      // ==========================================
      // VALIDATE INPUT
      // ==========================================

      if (
        !Number.isInteger(requestId) ||
        requestId <= 0
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Valid request_id is required"
        });

      }


      if (
        !requestedPiUsername ||
        !type ||
        !title ||
        !message
      ) {

        return res.status(400).json({

          success: false,

          error:
            "pi_username, type, title and message are required"

        });

      }


      // ==========================================
      // SECURITY PATCH
      // VERIFY REQUEST OWNER
      // ==========================================

      const requestCheck =
        await fetch(

          `${requestsEndpoint}?id=eq.${encodeURIComponent(requestId)}&select=id,pi_username&limit=1`,

          {
            headers
          }

        );


      const requestData =
        await requestCheck.json();


      if (!requestCheck.ok) {

        console.error(
          "Request owner check error:",
          requestData
        );

        return res.status(500).json({
          success: false,
          error:
            "Failed to verify request"
        });

      }


      if (
        !Array.isArray(requestData) ||
        requestData.length === 0
      ) {

        return res.status(404).json({
          success: false,
          error:
            "Request not found"
        });

      }


      const requestOwner =
        String(
          requestData[0].pi_username || ""
        )
        .trim();


      if (!requestOwner) {

        return res.status(400).json({
          success: false,
          error:
            "Request has no Pi username"
        });

      }


      // ==========================================
      // USERNAME MATCH CHECK
      // ==========================================

      if (
        requestOwner !==
        requestedPiUsername
      ) {

        return res.status(403).json({
          success: false,
          error:
            "Request owner mismatch"
        });

      }


      // ==========================================
      // CHECK DUPLICATE
      // ==========================================

      const existing =
        await fetch(

          `${endpoint}?select=id&request_id=eq.${encodeURIComponent(requestId)}&type=eq.${encodeURIComponent(type)}&limit=1`,

          {
            headers
          }

        );


      const existingData =
        await existing.json();


      if (!existing.ok) {

        console.error(
          "Notification duplicate check error:",
          existingData
        );

        return res.status(500).json({
          success: false,
          error:
            "Failed to check notification"
        });

      }


      if (
        Array.isArray(existingData) &&
        existingData.length > 0
      ) {

        return res.status(200).json({

          success: true,

          duplicate:
            true

        });

      }


      // ==========================================
      // CREATE NOTIFICATION
      // ==========================================

      const r =
        await fetch(

          endpoint,

          {
            method:
              "POST",

            headers: {

              ...headers,

              Prefer:
                "return=representation"

            },

            body:
              JSON.stringify({

                request_id:
                  requestId,

                // IMPORTANT:
                // Use verified username
                // from the request itself.
                pi_username:
                  requestOwner,

                type,

                title,

                message

              })

          }

        );


      const data =
        await r.json();


      if (!r.ok) {

        console.error(
          "Notifications POST error:",
          data
        );

        return res.status(500).json({
          success: false,
          error:
            "Failed to create notification"
        });

      }


      return res.status(201).json({

        success: true,

        notification:
          data?.[0] ||
          data

      });

    }


    // ==========================================
    // PATCH - MARK AS READ
    // ==========================================

    if (req.method === "PATCH") {

      const body =
        req.body || {};


      const id =
        Number(
          body.id
        );


      const piUsername =
        String(
          body.pi_username || ""
        )
        .trim()
        .slice(0, 100);


      if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !piUsername
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Valid id and pi_username are required"

        });

      }


      const r =
        await fetch(

          `${endpoint}?id=eq.${encodeURIComponent(id)}&pi_username=eq.${encodeURIComponent(piUsername)}`,

          {

            method:
              "PATCH",

            headers: {

              ...headers,

              Prefer:
                "return=representation"

            },

            body:
              JSON.stringify({

                is_read:
                  true

              })

          }

        );


      const data =
        await r.json();


      if (!r.ok) {

        console.error(
          "Notification PATCH error:",
          data
        );

        return res.status(500).json({

          success: false,

          error:
            "Failed to mark notification as read"

        });

      }


      if (
        !data ||
        data.length === 0
      ) {

        return res.status(404).json({

          success: false,

          error:
            "Notification not found"

        });

      }


      return res.status(200).json({

        success: true,

        notification:
          data[0]

      });

    }


    // ==========================================
    // METHOD NOT ALLOWED
    // ==========================================

    return res.status(405).json({

      success: false,

      error:
        "Method not allowed"

    });


  } catch (error) {

    console.error(
      "Notifications API error:",
      error
    );


    // ==========================================
    // SECURITY:
    // DO NOT EXPOSE SERVER ERROR DETAILS
    // ==========================================

    return res.status(500).json({

      success: false,

      error:
        "Internal server error"

    });

  }

}
