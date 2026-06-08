const https = require("https");

function httpsGet(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function httpsPost(options, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

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

  try {
    // ── SEARCH ──────────────────────────────────────────────────────
    if (endpoint === "search") {
      const bodyObj = {};

      // ContactOut People Search API accepts arrays for these fields
      if (params.title) bodyObj.title = params.title.split("|").map(s => s.trim()).filter(Boolean);
      if (params.industry) bodyObj.industry = params.industry.split("|").map(s => s.trim()).filter(Boolean);
      if (params.country) bodyObj.country = params.country.split("|").map(s => s.trim()).filter(Boolean);
      if (params.company_size) bodyObj.company_size = params.company_size.split("|").map(s => s.trim()).filter(Boolean);
      if (params.page) bodyObj.page = parseInt(params.page, 10) || 1;

      // Request full contact info and profile data in results
      bodyObj.include = ["emails", "phones", "experience", "company"];

      const requestBody = JSON.stringify(bodyObj);

      const data = await httpsPost({
        hostname: "api.contactout.com",
        path: "/v1/people/search",
        method: "POST",
        headers: {
          "token": apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      }, requestBody);

      let parsed;
      try { parsed = JSON.parse(data.body); } catch { parsed = {}; }

      // ContactOut returns profiles as an object keyed by linkedin URL
      // Normalize to array and attach the linkedin_url onto each person
      let people = [];

      if (parsed.profiles && typeof parsed.profiles === "object") {
        if (Array.isArray(parsed.profiles)) {
          people = parsed.profiles;
        } else {
          people = Object.entries(parsed.profiles).map(([url, person]) => {
            return { ...person, linkedin_url: person.linkedin_url || url };
          });
        }
      } else if (parsed.data && Array.isArray(parsed.data)) {
        people = parsed.data;
      } else if (Array.isArray(parsed.results)) {
        people = parsed.results;
      } else if (Array.isArray(parsed.people)) {
        people = parsed.people;
      }

      const total = parsed.total || parsed.total_count || people.length;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ people, total, raw: parsed }),
      };

    // ── ENRICH ──────────────────────────────────────────────────────
    } else if (endpoint === "enrich") {
      const linkedinUrl = params.profile || params.linkedin_url || "";
      if (!linkedinUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing LinkedIn URL" }) };
      }

      // Correct ContactOut enrich endpoint — include emails and phones
      const qs = new URLSearchParams({
        profile: linkedinUrl,
        include: "emails,phones",
      }).toString();

      const data = await httpsGet({
        hostname: "api.contactout.com",
        path: `/v1/linkedin/enrich?${qs}`,
        method: "GET",
        headers: {
          "token": apiKey,
          "Content-Type": "application/json",
        },
      });

      let parsed;
      try { parsed = JSON.parse(data.body); } catch { parsed = {}; }

      // Normalize — ContactOut wraps the person under profile or person key
      const person = parsed.profile || parsed.person || parsed.data || parsed;

      // Attach linkedin url if missing
      if (!person.linkedin_url) person.linkedin_url = linkedinUrl;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ person, raw: parsed }),
      };

    // ── USAGE ────────────────────────────────────────────────────────
    } else if (endpoint === "usage") {
      const data = await httpsGet({
        hostname: "api.contactout.com",
        path: "/v1/stats",
        method: "GET",
        headers: {
          "token": apiKey,
          "Content-Type": "application/json",
        },
      });

      let parsed;
      try { parsed = JSON.parse(data.body); } catch { parsed = {}; }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(parsed),
      };

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown endpoint: " + endpoint }) };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
