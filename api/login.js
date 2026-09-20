// api/login.js

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
    const res = await fetch(url);
    if (!res.ok) return { blocked: false, reason: "api_error" };

    const data = await res.json();
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
  } catch (e) {
    console.error("ip-api fetch failed:", e);
    return { blocked: false, reason: "fetch_failed" };
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
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const provided = (body && body.password) || "";

  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    "unknown";

  // --- VPN check ---
  const check = await isVpnOrProxy(ip);
  if (check.blocked) {
    await sendDiscord(
      `**Login blocked (${check.reason})**\n` +
        `IP: \`${ip}\`\n` +
        `ISP: \`${check.isp || "?"}\`\n` +
        `AS: \`${check.as || "?"}\``
    );
    return res.status(403).json({
      error:
        "VPN, proxy, or hosting connections are not allowed. Please disconnect your VPN and try again.",
      vpn: true,
    });
  }

  // --- Password check ---
  if (provided !== expected) {
    await sendDiscord(`**Login failed**\nIP: \`${ip}\``);
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = toBase64Url("ok:" + expected);

  // Set both the auth cookie AND the vpn_ok cookie so middleware doesn't
  // re-query the API for every page load.
  res.setHeader("Set-Cookie", [
    "site_auth=" +
      token +
      "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400",
    "vpn_ok=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800",
  ]);

  await sendDiscord(`**Login success**\nIP: \`${ip}\``);

  return res.status(200).json({ ok: true });
};