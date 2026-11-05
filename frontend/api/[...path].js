
export default async function handler(req, res) {
    const apiKey = process.env.DEVPILOT_API_KEY;
  
    if (!apiKey) {
      return res.status(500).json({
        detail: "Backend API key is not configured."
      });
    }
  
    const path = req.query.path;
    const segments = Array.isArray(path) ? path : [path];
  
    const endpoint = segments.map(encodeURIComponent).join("/");
  
    const upstream = new URL(
      `https://devpilot-backend-bts2.onrender.com/api/${endpoint}`
    );
  
    try {
      const headers = {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      };
  
      if (req.headers["content-type"]) {
        headers["Content-Type"] = req.headers["content-type"];
      }
  
      const response = await fetch(upstream, {
        method: req.method,
        headers,
        ...(
          req.method !== "GET" && req.method !== "HEAD"
            ? { body: JSON.stringify(req.body) }
            : {}
        )
      });
  
      const text = await response.text();
  
      res.status(response.status);
  
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
  
      return res.send(text);
  
    } catch (error) {
      console.error("Backend proxy failed:", error);
  
      return res.status(502).json({
        detail: "Unable to reach the backend."
      });
    }
  }
  