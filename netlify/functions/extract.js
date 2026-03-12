// netlify/functions/extract.js
// Serverless function — runs on Netlify's servers, never exposed to the browser.
// The ANTHROPIC_API_KEY environment variable is set in Netlify's dashboard (not in code).

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { fileContent, workstreamLabel, workstreamDescription, fieldDescriptions, fileName } = body;

  if (!fileContent || !workstreamLabel) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const prompt = `You are a data extraction specialist for Sustainable Energy for All (SEforALL) energy policy data.

Document: "${fileName}"
Workstream: ${workstreamLabel} — ${workstreamDescription}

Document content:
---
${fileContent.slice(0, 12000)}
---

Extract ALL data entries matching the fields below. Return ONLY a valid JSON array — one object per data record (typically one country-year pair). Multiple countries or years = multiple objects.

Fields to extract:
${fieldDescriptions}

Rules:
- Use null for missing fields — never guess or fabricate values
- Numbers must be numeric type, not strings
- Return ONLY the raw JSON array, no markdown fences, no explanation text
- If no relevant data found, return []

Example format: [{"country": "Kenya", "year": 2023, "access_rate": 75.4, "renewable_share": 82.1}]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: `Anthropic API error: ${err}` }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "[]";

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      parsed = [];
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: parsed }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Server error: ${err.message}` }),
    };
  }
};
