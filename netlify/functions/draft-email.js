const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Anthropic API key not configured" }) };
  }

  let profile;
  try {
    profile = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const {
    name,
    headline,
    company,
    company_website,
    company_industry,
    company_description,
    company_size,
    summary,
    current_title,
    current_role_start,
    has_website,
  } = profile;

  const userPrompt = `
Person: ${name}
Title: ${current_title || headline || ""}
Company: ${company || ""}
Company website: ${has_website ? company_website || "exists" : "NONE — no website found"}
Industry: ${company_industry || ""}
Company description: ${company_description || ""}
Company size: ${company_size || ""}
Their LinkedIn summary: ${summary || ""}
Joined current role: ${current_role_start || "unknown"}
`.trim();

  const systemPrompt = `You are writing a cold outreach email on behalf of Festus, a website designer. Follow these rules exactly:

- Write as Festus, a website designer. Do not mention Lagos or Nigeria.
- Do not use em dashes anywhere in the email.
- Do not offer a free audit. Do not include "no obligation" or "no pressure" language.
- Do not use generic compliments like "I love what you're doing" or "great work".
- Reference something specific about this person's actual company, industry, or role.
- If the company has no website, make that the hook — their competitors likely do, and it is costing them customers.
- If the company has a website, comment on something specific about their positioning or industry that connects to web presence.
- Keep the email under 150 words.
- End with a single soft question — not a call to action, not "hop on a call", not "would love to chat".
- Sign off as Festus only. No last name.
- The tone must sound like a human who genuinely noticed something. Not a salesperson running a sequence.
- Output format: first line is the subject line prefixed with SUBJECT: then a blank line then the email body. Nothing else.`;

  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
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

    const parsed = JSON.parse(result.body);
    const text = parsed.content?.[0]?.text || "";
    const lines = text.split("\n");
    const subjectLine = lines.find((l) => l.startsWith("SUBJECT:"))?.replace("SUBJECT:", "").trim() || "";
    const bodyStart = lines.findIndex((l) => l.startsWith("SUBJECT:")) + 1;
    const emailBody = lines
      .slice(bodyStart)
      .join("\n")
      .trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subjectLine, body: emailBody }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
