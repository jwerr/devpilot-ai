
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      detail: "Method not allowed"
    });
  }

  const apiKey = process.env.DEVPILOT_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      detail: "Backend API key not configured"
    });
  }

  try {
    const response = await fetch(
      "https://devpilot-backend-bts2.onrender.com/api/analyze-ci",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify(req.body)
      }
    );

    const body = await response.text();

    res.status(response.status);
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/json"
    );
    res.setHeader("X-DevPilot-Proxy", "review-pr-v1");

    return res.send(body);
  } catch (error) {
    console.error("PR review proxy failed:", error);

    return res.status(502).json({
      detail: "Unable to reach Render backend"
    });
  }
}
