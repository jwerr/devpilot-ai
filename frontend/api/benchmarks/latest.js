
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
    
        const response = await fetch(
            "https://devpilot-backend-bts2.onrender.com/api/evaluations/latest",
        {
          headers: {
            "X-API-Key": apiKey,
            "Accept": "application/json"
          }
        }
      );
  
      const body = await response.text();
  
      res.status(response.status);
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/json"
      );
      res.setHeader("X-DevPilot-Proxy", "benchmarks-v1");
  
      return res.send(body);
    } catch (error) {
      console.error("Benchmarks proxy failed:", error);
      return res.status(502).json({
        detail: "Unable to reach benchmarks backend"
      });
    }
  }
  