// api/login.js (or wherever your handler lives)

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
  // Skip local / private / unknown IPs — they can never be VPNs
  if (
    !ip ||
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  ) {
    return false;
  }

  try {
    // proxycheck.io — works without an API key (100 queries/day free)
    // Add &key=YOUR_KEY to raise the limit to 1,000/day
    const res = await fetch(
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1`
    );

    if (!res.ok) {
      console.error(`VPN detection API error: ${res.status}`);
      return false; // fail open so the site still works if the API is down
    }

    const data = await res.json();

    // proxycheck returns { status: "ok", "<ip>": { detections: { proxy, vpn, tor, ... } } }
    const entry = data[ip];
    if (!entry || !entry.detections) {
      console.error("Unexpected proxycheck response:", JSON.stringify(data));
      return false;
    }

    const d = entry.detections;
    return d.proxy === true || d.vpn === true || d.tor === true;

  } catch (e) {
    console.error("VPN detection fetch failed:", e);
    return false; // fail open
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

  // Extract the real client IP (first entry in x-forwarded-for)
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    "unknown";

  // --- VPN / Proxy / Tor check ---
  const blocked = await isVpnOrProxy(ip);
  if (blocked) {
    await sendDiscord(`**Login blocked (VPN/Proxy/Tor detected)**\nIP: \`${ip}\``);
    return res.status(403).json({
      error:
        "VPN, proxy, or Tor connections are not allowed. Please disable it and try again.",
    });
  }

  // --- Password check ---
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