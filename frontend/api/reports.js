
export default async function handler(req, res) {
    if (req.method !== "GET") {
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
      const limit = req.query.limit || "50";
  
      const url = new URL(
        "https://devpilot-backend-bts2.onrender.com/api/reports"
      );
      url.searchParams.set("limit", limit);
  
      const response = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json"
        }
      });
  
      const body = await response.text();
  
      res.status(response.status);
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/json"
      );
      res.setHeader("X-DevPilot-Proxy", "reports-v1");
  
      return res.send(body);
    } catch (error) {
      console.error("Reports proxy failed:", error);
      return res.status(502).json({
        detail: "Unable to reach reports backend"
      });
    }
  }
  