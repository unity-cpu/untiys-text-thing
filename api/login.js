
function toBase64Url(str) {
  const b64 = Buffer.from(str, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendDiscord(content) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (e) {
    console.error("discord webhook failed:", e);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return res.status(500).json({
      error: "SITE_PASSWORD is not set in Vercel Environment Variables",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const provided = (body && body.password) || "";
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";

  if (provided !== expected) {
    await sendDiscord(`**Login failed**\nIP: \`${ip}\``);
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = toBase64Url("ok:" + expected);

  res.setHeader(
    "Set-Cookie",
    "site_auth=" +
      token +
      "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400"
  );

  await sendDiscord(`**Login success**\nIP: \`${ip}\``);

  return res.status(200).json({ ok: true });
};