export const config = {
  matcher: ["/((?!api/login|_next|favicon.ico).*)"],
};

function toBase64Url(str) {
  // Edge runtime has btoa
  const b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Always allow the login page
  if (path === "/login.html" || path === "/login") {
    return;
  }

  const password = process.env.SITE_PASSWORD;

  if (!password) {
    return new Response(
      "SITE_PASSWORD is not set.\n\nVercel → Settings → Environment Variables → add SITE_PASSWORD → Redeploy.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const expectedToken = toBase64Url("ok:" + password);

  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return i === -1 ? [c, ""] : [c.slice(0, i), c.slice(i + 1)];
      })
  );

  if (cookies.site_auth === expectedToken) {
    return; // authenticated
  }

  return Response.redirect(new URL("/login.html", request.url), 302);
}
