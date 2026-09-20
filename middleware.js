// middleware.js
// Protects the public site with a signed HttpOnly session cookie.

const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySession(token, secret) {
  if (!token || !secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expires, signature] = parts;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(expires)
    );
  } catch {
    return false;
  }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only protect the actual site page. Login and API endpoints remain reachable.
  if (pathname !== "/" && pathname !== "/index.html") {
    return;
  }

  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) {
    return new Response("SITE_AUTH_SECRET is not configured.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)site_auth=([^;]+)/);
  const authenticated = await verifySession(match?.[1], secret);

  if (!authenticated) {
    const loginUrl = new URL("/login.html", request.url);
    loginUrl.searchParams.set("next", pathname);
    return Response.redirect(loginUrl, 302);
  }

  return;
}

export const config = {
  matcher: ["/", "/index.html"],
};
