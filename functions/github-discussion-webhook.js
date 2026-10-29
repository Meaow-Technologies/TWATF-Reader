const REPOSITORY = "Meaow-Technologies/TWATF-Reader";
const MAX_DESCRIPTION_LENGTH = 4_000;
const WEBHOOK_AVATAR_URL = "https://twatf.pages.dev/assets/images/jaehwan.png";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

async function signatureFor(body, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `sha256=${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function truncate(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function commentEmbed(payload) {
  const comment = payload.comment;
  const discussion = payload.discussion;
  const sender = payload.sender || comment.user;
  const login = sender?.login || comment.user?.login || "Unknown user";
  const profileUrl = sender?.html_url || comment.user?.html_url;
  const avatarUrl = sender?.avatar_url || comment.user?.avatar_url;
  const discussionUrl = discussion.html_url || comment.html_url;

  return {
    username: "[TWATF] Chapter Discussion",
    avatar_url: WEBHOOK_AVATAR_URL,
    embeds: [
      {
        author: {
          name: login,
          url: profileUrl,
          icon_url: avatarUrl,
        },
        title: truncate(discussion.title || "New chapter discussion", 256),
        url: discussionUrl,
        description: truncate(comment.body, MAX_DESCRIPTION_LENGTH),
        color: 0xc4d1a1,
        footer: { text: "The World After the Fall Reader" },
        timestamp: comment.created_at || new Date().toISOString(),
      },
    ],
  };
}

export async function onRequestPost({ request, env }) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  const discordWebhookUrl = env.DISCORD_GISCUS_WEBHOOK_URL;
  if (!secret || !discordWebhookUrl) {
    return json({ error: "Webhook integration is not configured." }, 503);
  }

  const body = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256") || "";
  const expected = await signatureFor(body, secret);
  if (!timingSafeEqual(signature, expected)) {
    return json({ error: "Invalid webhook signature." }, 401);
  }

  if (request.headers.get("X-GitHub-Event") !== "discussion_comment") {
    return json({ ignored: true });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  if (
    payload.action !== "created" ||
    payload.repository?.full_name !== REPOSITORY ||
    !payload.comment?.body ||
    !payload.discussion?.html_url
  ) {
    return json({ ignored: true });
  }

  const response = await fetch(discordWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(commentEmbed(payload)),
  });
  if (!response.ok) {
    return json({ error: "Discord webhook rejected the notification." }, 502);
  }

  return json({ delivered: true });
}

export function onRequest({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  return json({ error: "Use POST." }, 405);
}
