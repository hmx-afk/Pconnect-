export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const {
            service,
            name,
            contact,
            details
        } = req.body;

        if (!service || !name || !contact || !details) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const request = {
            service: service,
            name: name,
            contact: contact,
            details: details,
            payment: "Pi Network",
            status: "Submitted",
            reviewStatus: "Waiting for review",
            createdAt: new Date().toISOString()
        };

        console.log("New PiConnect request:", request);

        return res.status(200).json({
            success: true,
            message: "Request received successfully",
            request: request
        });

    } catch (error) {

        console.error("Request API error:", error);

        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
