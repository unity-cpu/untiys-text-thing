// api/notify.js
const crypto = require("crypto");

function base64UrlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hasValidSession(req) {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)site_auth=([^;]+)/);
  if (!match) return false;

  const parts = match[1].split(".");
  if (parts.length !== 2) return false;

  const expires = Number(parts[0]);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(String(expires))
    .digest();

  try {
    return crypto.timingSafeEqual(expected, base64UrlToBuffer(parts[1]));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return res.status(500).json({ error: "DISCORD_WEBHOOK_URL not set" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const type = typeof body?.type === "string" ? body.type : "unknown";
  const value = typeof body?.value === "string" ? body.value : "";

  // Keep webhook messages bounded.
  const safeValue = value.slice(0, 1500);
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";

  let title;
  let description;

  if (type === "message") {
    title = "Message Sent";
    description = `\\`\\`\\`\n${safeValue}\n\\`\\`\\``;
  } else if (type === "event") {
    title = "Event Sent";
    description = `**Path:** \`${safeValue}\``;
  } else if (type === "clear") {
    title = "Cleared";
    description = "The data was cleared.";
  } else {
    title = type.slice(0, 100);
    description = `\\`\\`\\`\n${safeValue}\n\\`\\`\\``;
  }

  const embed = {
    title,
    description,
    fields: [
      { name: "IP", value: `\`${ip}\``, inline: true },
      { name: "Type", value: `\`${type}\``, inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "unity text thing" },
  };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      console.error("Discord webhook error:", await response.text());
      return res.status(502).json({ error: "Discord webhook failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("discord error:", error);
    return res.status(500).json({ error: "Failed to send" });
  }
};
