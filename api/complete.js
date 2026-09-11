export default async function handler(req, res) {
  try {
    const { paymentId, txid } = req.body;

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

    const response = await fetch(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      {
        method: "POST",
        headers: {
          "Authorization": `Key ${process.env.PI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ txid })
      }
    );

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    console.error("Complete error:", error);

    return res.status(500).json({
      error: error.message
    });
  }
}
