const https = require("https");
const http = require("http");

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

  // Build query string from all params except _endpoint
  const forwardParams = { ...params };
  delete forwardParams._endpoint;
  const qs = new URLSearchParams(forwardParams).toString();

  let path = "";
  if (endpoint === "search") {
    path = "/v1/people/search" + (qs ? "?" + qs : "");
  } else if (endpoint === "enrich") {
    path = "/v1/linkedin/enrich" + (qs ? "?" + qs : "");
  } else if (endpoint === "usage") {
    path = "/v1/user/me" + (qs ? "?" + qs : "");
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown endpoint" }) };
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.contactout.com",
        path,
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
    return {
      statusCode: data.status,
      headers: { "Content-Type": "application/json" },
      body: data.body,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
