module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;

  if (!webhook) {
    return res.status(500).json({
      error: "DISCORD_WEBHOOK_URL not set"
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

  const type = body.type || "unknown";
  const value = body.value || "";

  const ip =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    "unknown";

  let title = "";
  let description = "";

  if (type === "message") {
    title = "Message Sent";
    description = `\`\`\`\n${value}\n\`\`\``;
  } else if (type === "event") {
    title = "Event Sent";
    description = `**Path:** \`${value}\``;
  } else if (type === "clear") {
    title = "Cleared";
    description = "The data was cleared.";
  } else {
    title = type;
    description = `\`\`\`\n${value}\n\`\`\``;
  }

  const embed = {
    title: title,
    description: description,
    fields: [
      {
        name: "IP",
        value: `\`${ip}\``,
        inline: true
      },
      {
        name: "Type",
        value: `\`${type}\``,
        inline: true
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: "milk tag global message logger",
    }
  };

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });

    if (!r.ok) {
      const errorText = await r.text();

      console.error("Discord webhook error:", errorText);

      return res.status(502).json({
        error: "Discord webhook failed"
      });
    }

    return res.status(200).json({
      ok: true
    });

  } catch (e) {
    console.error("discord error:", e);

    return res.status(500).json({
      error: "Failed to send"
    });
  }
};