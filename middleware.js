// middleware.js
// Runs on every request before it hits your pages or API routes.
// Blocks VPN/proxy/hosting IPs with a full-screen "disconnect VPN" page.

export const config = {
  // Run on everything except static assets and the login endpoint
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/login|.*\\.(?:png|jpg|jpeg|svg|css|js|ico|woff2?)$).*)",
  ],
};

// ---------- Block page (served when VPN detected) ----------
function blockPage(reason) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VPN Detected</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #0b0d12;
    color: #e6e8ee;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    max-width: 480px;
    width: 100%;
    background: #12151d;
    border: 1px solid #1f2430;
    border-radius: 16px;
    padding: 40px 32px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .icon { font-size: 48px; margin-bottom: 8px; }
  h1 {
    font-size: 22px;
    margin: 8px 0 12px;
    font-weight: 600;
    color: #fff;
  }
  p {
    font-size: 15px;
    line-height: 1.55;
    color: #9aa3b2;
    margin: 0 0 20px;
  }
  .btn {
    display: inline-block;
    background: #2b6cf6;
    color: #fff;
    text-decoration: none;
    padding: 11px 22px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
  }
  .btn:hover { background: #1e5be0; }
  .reason {
    font-size: 12px;
    color: #5b6473;
    margin-top: 18px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🛡️</div>
    <h1>VPN Detected</h1>
    <p>
      You're connected through a VPN, proxy, or hosting network.
      Please <strong>disconnect your VPN</strong> and reload this page to continue.
    </p>
    <button class="btn" onclick="location.reload()">I've Disconnected — Reload</button>
    <div class="reason">reason: ${reason}</div>
  </div>
</body>
</html>`;
}

// ---------- VPN / proxy / hosting check ----------
function isLocalIp(ip) {
  return (
    !ip ||
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

async function checkVpn(ip) {
  if (isLocalIp(ip)) return { blocked: false, reason: "local" };

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
    return { blocked: false, reason: "clean", isp: data.isp };
  } catch (e) {
    return { blocked: false, reason: "fetch_failed" };
  }
}

// ---------- Middleware entry ----------
export async function middleware(req) {
  // If the client already passed the check recently, skip re-checking.
  // Short TTL keeps the API from being hammered on every asset request.
  const cleared = req.cookies.get("vpn_ok")?.value;
  if (cleared === "1") {
    return; // undefined => NextResponse.next() by default
  }

  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "";

  const result = await checkVpn(ip);

  if (result.blocked) {
    return new Response(blockPage(result.reason), {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  // Clean — let them through and remember for 30 minutes.
  const res = Response.next ? Response.next() : new Response(null);
  // For plain Vercel middleware, build a passthrough with a cookie:
  const headers = new Headers();
  headers.append(
    "set-cookie",
    `vpn_ok=1; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { status: 200, headers });
}