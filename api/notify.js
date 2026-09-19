module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return res.status(500).json({ error: "DISCORD_WEBHOOK_URL not set" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const type = body.type || "unknown";
  const value = body.value || "";
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";

  let content = "";

  if (type === "message") {
    content = `💬 **Message sent**\n\`\`\`\n${value}\n\`\`\`\nIP: \`${ip}\``;
  } else if (type === "event") {
    content = `⚡ **Event sent**\nPath: \`${value}\`\nIP: \`${ip}\``;
  } else if (type === "clear") {
    content = `🧹 **Cleared**\nIP: \`${ip}\``;
  } else {
    content = `📝 **${type}**\n\`\`\`\n${value}\n\`\`\`\nIP: \`${ip}\``;
  }

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!r.ok) {
      return res.status(502).json({ error: "Discord webhook failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("discord error:", e);
    return res.status(500).json({ error: "Failed to send" });
  }
};
