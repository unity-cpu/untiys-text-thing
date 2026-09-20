// api/checkvpn.js
// Lightweight endpoint the login page calls on load to see if the visitor
// is on a VPN before they even try to submit the form.

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
      };
    }
    return { blocked: false, reason: "clean" };
  } catch (e) {
    return { blocked: false, reason: "fetch_failed" };
  }
}

module.exports = async function handler(req, res) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    "unknown";

  const result = await isVpnOrProxy(ip);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    vpn: result.blocked,
    reason: result.reason,
  });
};