function toBase64Url(str) {
  // Match what middleware does with btoa + replacements
  const b64 = Buffer.from(str, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    res.status(500).json({
      error: "SITE_PASSWORD is not set in Vercel Environment Variables",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const provided = body?.password ?? "";

  if (provided !== expected) {
    res.status(401).json({ error: "Wrong password" });
    return;
  }

  const token = toBase64Url("ok:" + expected);

  res.setHeader(
    "Set-Cookie",
    [
      `site_auth=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=86400",
    ].join("; ")
  );

  res.status(200).json({ ok: true });
}
