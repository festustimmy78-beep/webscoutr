const https = require("https");

exports.handler = async function (event) {
  const apiKey = process.env.CONTACTOUT_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  const params = event.queryStringParameters || {};
  const endpoint = params._endpoint;
  if (!endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing _endpoint parameter" }) };
  }

  const forwardParams = { ...params };
  delete forwardParams._endpoint;

  try {
    let data;

    if (endpoint === "search") {
      // Search is POST with JSON body
      const bodyObj = {};
      if (forwardParams.title) bodyObj.title = forwardParams.title.split("|");
      if (forwardParams.industry) bodyObj.industry = forwardParams.industry.split("|");
      if (forwardParams.country) bodyObj.country = forwardParams.country.split("|");
      if (forwardParams.company_size) bodyObj.company_size = forwardParams.company_size.split("|");
      if (forwardParams.page) bodyObj.page = parseInt(forwardParams.page, 10);

      const requestBody = JSON.stringify(bodyObj);

      data = await new Promise((resolve, reject) => {
        const options = {
          hostname: "api.contactout.com",
          path: "/v1/people/search",
          method: "POST",
          headers: {
            token: apiKey,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(requestBody),
          },
        };
        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.write(requestBody);
        req.end();
      });

    } else if (endpoint === "enrich") {
      // Enrich is GET with linkedin_url query param
      const qs = new URLSearchParams({ linkedin_url: forwardParams.profile || "" }).toString();
      data = await new Promise((resolve, reject) => {
        const options = {
          hostname: "api.contactout.com",
          path: "/v1/people/linkedin?" + qs,
          method: "GET",
          headers: {
            token: apiKey,
            "Content-Type": "application/json",
          },
        };
        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end();
      });

    } else if (endpoint === "usage") {
      data = await new Promise((resolve, reject) => {
        const options = {
          hostname: "api.contactout.com",
          path: "/v1/user/me",
          method: "GET",
          headers: {
            token: apiKey,
            "Content-Type": "application/json",
          },
        };
        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end();
      });

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown endpoint" }) };
    }

    // For search, normalize response so frontend can find the people array
    if (endpoint === "search") {
      try {
        const parsed = JSON.parse(data.body);
        // ContactOut returns { profiles: { "linkedin_url": { ...data } } }
        // Normalize to { people: [...] } so the frontend works
        if (parsed.profiles && typeof parsed.profiles === "object") {
          const people = Object.values(parsed.profiles);
          const normalized = JSON.stringify({ people, total: parsed.total || people.length });
          return {
            statusCode: data.status,
            headers: { "Content-Type": "application/json" },
            body: normalized,
          };
        }
      } catch (_) {}
    }

    return {
      statusCode: data.status,
      headers: { "Content-Type": "application/json" },
      body: data.body,
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
