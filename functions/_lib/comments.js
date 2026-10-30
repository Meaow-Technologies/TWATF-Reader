const MAX_BODY_LENGTH = 4000;
const MAX_CHAPTER_LENGTH = 80;
const SESSION_DAYS = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const ADMIN_IDS = new Set(["753867276431654923", "979012536802373672"]);
const ALLOWED_EMOJIS = new Set(["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀", "🚀", "👎"]);
const rateWindows = new Map();

const SLUR_PATTERNS = [
  /\bn[i1!|]+[g9]+[e3]+r+s?\b/i,
  /\bn[i1!|]+g{2,}[ae]*\b/i,
  /\bpaj[e3][e3]t+s?\b/i,
  /\bjeet+s?\b/i,
  /\bch[i1][n]+[k]+s?\b/i,
  /\bsp[i1][c]+s?\b/i,
  /\bgooks?\b/i,
  /\bk[i1]k[e3]s?\b/i,
  /\bwetbacks?\b/i,
  /\bbeaner[s]?\b/i,
  /\bh[a4]jj[i1]\b/i,
  /\bsandnigger[s]?\b/i,
  /\bcoon[s]?\b/i,
  /\bjigaboo[s]?\b/i,
  /\bporch\s*monkey\b/i,
  /\bzipper\s*head\b/i,
  /\bsl[a4]nt\s*ey[e3]d?\b/i,
  /\btr[a4]nn[y1][s]?\b/i,
  /\bretards?\b/i,
];

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function redirect(url, headers = {}) {
  const h = new Headers();
  h.set("Location", url);
  if (headers instanceof Headers) {
    if (typeof headers.getSetCookie === "function") {
      for (const cookie of headers.getSetCookie()) {
        h.append("Set-Cookie", cookie);
      }
    }
    for (const [k, v] of headers.entries()) {
      if (k.toLowerCase() !== "set-cookie") h.append(k, v);
    }
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) {
        for (const item of v) h.append(k, item);
      } else {
        h.append(k, v);
      }
    }
  }
  return new Response(null, { status: 302, headers: h });
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function cookieHeader(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

function nowIso() {
  return new Date().toISOString();
}

function expiresIso(days = SESSION_DAYS) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function signedState(payload, secret) {
  const value = btoa(JSON.stringify(payload));
  return `${value}.${await hmac(value, secret)}`;
}

async function verifyState(value, secret) {
  const [encoded, signature] = String(value || "").split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(encoded, secret);
  if (signature.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch !== 0) return null;
  try {
    const payload = JSON.parse(atob(encoded));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function safeReturnTo(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

function isAdmin(user) {
  return Boolean(user && ADMIN_IDS.has(String(user.provider_user_id)));
}

function validChapter(chapter) {
  return typeof chapter === "string" && /^\/?(?:first|revised):\d{1,4}$/.test(chapter) && chapter.length <= MAX_CHAPTER_LENGTH;
}

function normalizeChapter(chapter) {
  return String(chapter).replace(/^\/+/, "");
}

function containsSlur(value) {
  return SLUR_PATTERNS.some((pattern) => pattern.test(value));
}

function validateBody(value) {
  if (typeof value !== "string") return "Comment text is required.";
  const body = value.trim();
  if (!body) return "Comment text is required.";
  if (body.length > MAX_BODY_LENGTH) return `Comments must be ${MAX_BODY_LENGTH} characters or fewer.`;
  if (containsSlur(body)) return "That comment contains prohibited hate speech.";
  return null;
}

function clientKey(request, user) {
  return user ? `user:${user.id}` : `ip:${request.headers.get("CF-Connecting-IP") || "anonymous"}`;
}

function allowRequest(request, user) {
  const key = clientKey(request, user);
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

async function dbUser(env, id) {
  if (!env.COMMENTS_DB || !id) return null;
  const result = await env.COMMENTS_DB.prepare(
    `SELECT id, provider, provider_user_id, login, display_name, avatar_url,
            is_admin, is_legacy FROM users WHERE id = ?`,
  ).bind(id).first();
  return result ? formatUser(result) : null;
}

function formatUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    login: row.login,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isAdmin: Boolean(row.is_admin),
    isLegacy: Boolean(row.is_legacy),
  };
}

async function currentUser(request, env) {
  const token = cookieValue(request, "twatf_session");
  if (!token || !env.COMMENTS_DB) return null;
  const row = await env.COMMENTS_DB.prepare(
    `SELECT u.id, u.provider, u.provider_user_id, u.login, u.display_name,
            u.avatar_url, u.is_admin, u.is_legacy
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(token, nowIso()).first();
  return row ? formatUser(row) : null;
}

async function createSession(env, userId, secure = true) {
  const token = randomToken();
  await env.COMMENTS_DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
  ).bind(token, userId, expiresIso()).run();
  return cookieHeader("twatf_session", token, { secure, maxAge: SESSION_DAYS * 86_400 });
}

async function upsertDiscordUser(env, profile) {
  const id = `discord:${profile.id}`;
  const isAdminValue = ADMIN_IDS.has(String(profile.id)) ? 1 : 0;
  await env.COMMENTS_DB.prepare(
    `INSERT INTO users
       (id, provider, provider_user_id, login, display_name, avatar_url, is_admin, updated_at)
     VALUES (?, 'discord', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       login = excluded.login,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       is_admin = excluded.is_admin,
       updated_at = excluded.updated_at`,
  ).bind(
    id,
    String(profile.id),
    profile.username || profile.global_name || "Discord user",
    profile.global_name || profile.username || "Discord user",
    profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128`
      : null,
    isAdminValue,
    nowIso(),
  ).run();
  return id;
}

function errorResponse(error, status = 400) {
  return json({ error }, status);
}

async function notifyDiscord(env, payload) {
  const url = env.DISCORD_GISCUS_WEBHOOK_URL;
  if (!url) return;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Discord notification failed.");
}

function commentEmbed(comment, author, baseUrl) {
  return {
    username: "[TWATF] Chapter Discussion",
    avatar_url: `${baseUrl}/assets/images/jaehwan.png`,
    embeds: [{
      author: {
        name: author.displayName,
        url: `https://discord.com/users/${author.providerUserId}`,
        icon_url: author.avatarUrl || undefined,
      },
      title: `New comment on ${comment.chapter}`,
      url: `${baseUrl}/${comment.chapter.replace(":", "/chapter-")}`,
      description: comment.body.slice(0, 4000),
      color: 0xc4d1a1,
      footer: { text: "The World After the Fall Reader" },
      timestamp: comment.createdAt,
    }],
  };
}

export {
  ALLOWED_EMOJIS,
  MAX_BODY_LENGTH,
  ADMIN_IDS,
  commentEmbed,
  containsSlur,
  createSession,
  cookieHeader,
  cookieValue,
  currentUser,
  dbUser,
  errorResponse,
  expiresIso,
  formatUser,
  isAdmin,
  json,
  normalizeChapter,
  nowIso,
  notifyDiscord,
  randomToken,
  redirect,
  safeReturnTo,
  signedState,
  upsertDiscordUser,
  validChapter,
  validateBody,
  verifyState,
  allowRequest,
};
