const WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 5_000;
const LIMITS = {
  normal: 180,
  content: 30,
};

const blockedUserAgents =
  /WebToEpub|wget|curl|python-requests|scrapy|axios|go-http-client|libwww-perl/i;
const fallbackWindows = new Map();

function isContentRequest(pathname) {
  return (
    pathname.startsWith("/data/") ||
    pathname.startsWith("/assets/downloads/")
  );
}

function getClientKey(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  return ip ? `ip:${ip}` : "anonymous";
}

function fallbackLimit(key, limit) {
  const now = Date.now();
  const current = fallbackWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    if (fallbackWindows.size >= MAX_TRACKED_CLIENTS) {
      for (const [storedKey, window] of fallbackWindows) {
        if (now - window.startedAt >= WINDOW_MS) fallbackWindows.delete(storedKey);
      }
    }
    fallbackWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function rateLimit(request, env, contentRequest) {
  const limit = contentRequest ? LIMITS.content : LIMITS.normal;
  const key = `${getClientKey(request)}:${contentRequest ? "content" : "normal"}`;

  const binding = contentRequest
    ? env.CONTENT_RATE_LIMITER || env.RATE_LIMITER
    : env.RATE_LIMITER;
  if (binding && typeof binding.limit === "function") {
    const result = await binding.limit({ key });
    return result.success;
  }
  return fallbackLimit(key, limit);
}

function responseHeaders(contentRequest) {
  const headers = new Headers({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Robots-Tag": contentRequest
      ? "noindex, nofollow, noarchive"
      : "index, follow",
  });
  return headers;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const contentRequest = isContentRequest(url.pathname);
  const userAgent = request.headers.get("User-Agent") || "";

  if (contentRequest && blockedUserAgents.test(userAgent)) {
    return new Response("Automated content extraction is not permitted.", {
      status: 403,
      headers: {
        ...Object.fromEntries(responseHeaders(true)),
        "Retry-After": "3600",
      },
    });
  }

  if (!(await rateLimit(request, env, contentRequest))) {
    return new Response("Too many requests. Please try again later.", {
      status: 429,
      headers: {
        ...Object.fromEntries(responseHeaders(contentRequest)),
        "Retry-After": "60",
      },
    });
  }

  const response = await next();
  const headers = new Headers(response.headers);
  if (typeof response.headers.getSetCookie === "function") {
    headers.delete("Set-Cookie");
    for (const cookie of response.headers.getSetCookie()) {
      headers.append("Set-Cookie", cookie);
    }
  }
  for (const [name, value] of responseHeaders(contentRequest)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (url.pathname.startsWith("/giscus/")) {
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
