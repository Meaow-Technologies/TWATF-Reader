import {
  ALLOWED_EMOJIS,
  currentUser,
  errorResponse,
  json,
  allowRequest,
} from "../../../../../_lib/comments.js";

export async function onRequestPost({ request, env, params }) {
  const user = await currentUser(request, env);
  if (!user) return errorResponse("Sign in with Discord to react.", 401);
  if (!allowRequest(request, user)) return errorResponse("Too many requests. Please try again later.", 429);
  const emoji = decodeURIComponent(params.emoji || "");
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1 || !ALLOWED_EMOJIS.has(emoji)) {
    return errorResponse("Invalid reaction.", 400);
  }
  const comment = await env.COMMENTS_DB.prepare(
    "SELECT id FROM comments WHERE id = ? AND deleted_at IS NULL",
  ).bind(id).first();
  if (!comment) return errorResponse("Comment not found.", 404);
  const existing = await env.COMMENTS_DB.prepare(
    "SELECT 1 FROM reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
  ).bind(id, user.id, emoji).first();
  if (existing) {
    await env.COMMENTS_DB.prepare(
      "DELETE FROM reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
    ).bind(id, user.id, emoji).run();
  } else {
    await env.COMMENTS_DB.prepare(
      "INSERT INTO reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
    ).bind(id, user.id, emoji).run();
  }
  const rows = await env.COMMENTS_DB.prepare(
    `SELECT r.emoji, r.user_id, u.display_name
       FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.comment_id = ?`,
  ).bind(id).all();
  const grouped = new Map();
  for (const row of rows.results || []) {
    const item = grouped.get(row.emoji) || { emoji: row.emoji, count: 0, mine: false, users: [] };
    item.count += 1;
    item.mine ||= row.user_id === user.id;
    if (item.users.length < 20) item.users.push(row.display_name);
    grouped.set(row.emoji, item);
  }
  return json({ reactions: [...grouped.values()] });
}

export function onRequest(context) {
  return context.request.method === "POST"
    ? onRequestPost(context)
    : errorResponse("Method not allowed.", 405);
}
