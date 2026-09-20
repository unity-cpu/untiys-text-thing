// api/login.js
const crypto = require("crypto");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    "unknown"
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createSession(secret, maxAgeSeconds = 86400) {
  const expires = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(String(expires))
    .digest("base64url");

  return `${expires}.${signature}`;
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
  } catch (error) {
    console.error("discord webhook failed:", error);
  }
}

async function isVpnOrProxy(ip) {
  if (
    !ip ||
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  ) {
    return { blocked: false, reason: "local" };
  }

  const fields = "status,message,proxy,hosting,isp,org,as,query";
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return { blocked: false, reason: "api_error" };

    const data = await response.json();
    if (!data || data.status !== "success") {
      return { blocked: false, reason: "bad_response" };
    }

    if (data.proxy === true || data.hosting === true) {
      return {
        blocked: true,
        reason: data.proxy ? "vpn/proxy/tor" : "datacenter/hosting",
        isp: data.isp,
        org: data.org,
        as: data.as,
      };
    }

    return { blocked: false, reason: "clean" };
  } catch (error) {
    console.error("ip-api fetch failed:", error);
    return { blocked: false, reason: "fetch_failed" };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.SITE_PASSWORD;
  const authSecret = process.env.SITE_AUTH_SECRET;

  if (!expected || !authSecret) {
    return res.status(500).json({
      error: "SITE_PASSWORD and SITE_AUTH_SECRET must be set in Vercel Environment Variables.",
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

  const provided = typeof body?.password === "string" ? body.password : "";
  const ip = getClientIp(req);

  const check = await isVpnOrProxy(ip);
  if (check.blocked) {
    await sendDiscord(
      `**Login blocked (${check.reason})**\nIP: \`${ip}\`\nISP: \`${check.isp || "?"}\`\nAS: \`${check.as || "?"}\``
    );

    return res.status(403).json({
      error: "VPN, proxy, or hosting connections are not allowed. Please disconnect your VPN and try again.",
      vpn: true,
    });
  }

  if (!safeEqual(provided, expected)) {
    await sendDiscord(`**Login failed**\nIP: \`${ip}\``);
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = createSession(authSecret);

  res.setHeader("Set-Cookie", [
    `site_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
    `vpn_ok=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`,
  ]);

  await sendDiscord(`**Login success**\nIP: \`${ip}\``);

  return res.status(200).json({ ok: true });
};
