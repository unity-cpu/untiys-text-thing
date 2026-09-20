// api/logout.js
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", [
    "site_auth=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    "vpn_ok=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  ]);

  return res.status(200).json({ ok: true });
};
