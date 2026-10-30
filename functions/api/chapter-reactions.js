import {
  ALLOWED_EMOJIS,
  currentUser,
  errorResponse,
  json,
  allowRequest,
  normalizeChapter,
  validChapter,
} from "../_lib/comments.js";

async function getReactions(env, chapter, user) {
  const rows = await env.COMMENTS_DB.prepare(
    `SELECT r.emoji, r.user_id, u.display_name
       FROM chapter_reactions r JOIN users u ON u.id = r.user_id
      WHERE r.chapter = ?`,
  ).bind(chapter).all();
  const grouped = new Map();
  for (const row of rows.results || []) {
    const item = grouped.get(row.emoji) || { emoji: row.emoji, count: 0, mine: false, users: [] };
    item.count += 1;
    item.mine ||= row.user_id === user?.id;
    if (item.users.length < 20) item.users.push(row.display_name);
    grouped.set(row.emoji, item);
  }
  return [...grouped.values()];
}

export async function onRequestGet({ request, env }) {
  const chapter = normalizeChapter(new URL(request.url).searchParams.get("chapter"));
  if (!validChapter(chapter)) return errorResponse("Invalid chapter.", 400);
  return json({ reactions: await getReactions(env, chapter, await currentUser(request, env)) });
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return errorResponse("Sign in with Discord to react.", 401);
  if (!allowRequest(request, user)) return errorResponse("Too many requests. Please try again later.", 429);
  let input;
  try { input = await request.json(); } catch { return errorResponse("Invalid JSON body.", 400); }
  const chapter = normalizeChapter(input?.chapter);
  const emoji = String(input?.emoji || "");
  if (!validChapter(chapter) || !ALLOWED_EMOJIS.has(emoji)) return errorResponse("Invalid reaction.", 400);
  const existing = await env.COMMENTS_DB.prepare(
    "SELECT 1 FROM chapter_reactions WHERE chapter = ? AND user_id = ? AND emoji = ?",
  ).bind(chapter, user.id, emoji).first();
  if (existing) {
    await env.COMMENTS_DB.prepare(
      "DELETE FROM chapter_reactions WHERE chapter = ? AND user_id = ? AND emoji = ?",
    ).bind(chapter, user.id, emoji).run();
  } else {
    await env.COMMENTS_DB.prepare(
      "INSERT INTO chapter_reactions (chapter, user_id, emoji) VALUES (?, ?, ?)",
    ).bind(chapter, user.id, emoji).run();
  }
  return json({ reactions: await getReactions(env, chapter, user) });
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return errorResponse("Method not allowed.", 405);
}
