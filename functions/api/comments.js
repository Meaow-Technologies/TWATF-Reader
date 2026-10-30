import {
  commentEmbed,
  currentUser,
  errorResponse,
  formatUser,
  json,
  normalizeChapter,
  notifyDiscord,
  nowIso,
  validChapter,
  validateBody,
  allowRequest,
} from "../_lib/comments.js";

function formatComment(row, reactions, user) {
  const grouped = new Map();
  for (const reaction of reactions) {
    const item = grouped.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false, users: [] };
    item.count += 1;
    item.mine ||= reaction.user_id === user?.id;
    if (item.users.length < 20) item.users.push(reaction.display_name);
    grouped.set(reaction.emoji, item);
  }
  return {
    id: row.id,
    chapter: row.chapter,
    parentId: row.parent_id,
    body: row.body,
    isLegacy: Boolean(row.is_legacy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: Boolean(row.updated_at),
    author: formatUser({
      id: row.user_id,
      provider: row.provider,
      provider_user_id: row.provider_user_id,
      login: row.login,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_admin: row.is_admin,
      is_legacy: row.user_is_legacy,
    }),
    reactions: [...grouped.values()],
  };
}

async function commentsWithReactions(env, rows, user) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const reactions = await env.COMMENTS_DB.prepare(
    `SELECT r.comment_id, r.user_id, r.emoji, u.display_name
       FROM reactions r JOIN users u ON u.id = r.user_id
      WHERE r.comment_id IN (${placeholders})`,
  ).bind(...ids).all();
  const byComment = new Map();
  for (const reaction of reactions.results || []) {
    const list = byComment.get(reaction.comment_id) || [];
    list.push(reaction);
    byComment.set(reaction.comment_id, list);
  }
  return rows.map((row) => formatComment(row, byComment.get(row.id) || [], user));
}

async function counts(env, chapter) {
  const row = await env.COMMENTS_DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END) AS roots,
            SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) AS replies
       FROM comments WHERE chapter = ? AND deleted_at IS NULL`,
  ).bind(chapter).first();
  return {
    total: Number(row?.total || 0),
    roots: Number(row?.roots || 0),
    replies: Number(row?.replies || 0),
  };
}

export async function onRequestGet({ request, env }) {
  const chapter = normalizeChapter(new URL(request.url).searchParams.get("chapter"));
  const scope = new URL(request.url).searchParams.get("scope") || "roots";
  if (!validChapter(chapter)) return errorResponse("Invalid chapter.", 400);
  try {
    const user = await currentUser(request, env);
    const summary = await counts(env, chapter);
    if (scope === "count") return json(summary);
    const rows = await env.COMMENTS_DB.prepare(
      `SELECT c.id, c.chapter, c.parent_id, c.body, c.is_legacy, c.created_at, c.updated_at,
              u.id AS user_id, u.provider, u.provider_user_id, u.login, u.display_name,
              u.avatar_url, u.is_admin, u.is_legacy AS user_is_legacy
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.chapter = ? AND c.parent_id IS NULL AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC LIMIT 200`,
    ).bind(chapter).all();
    const comments = await commentsWithReactions(env, rows.results || [], user);
    const replyRows = await env.COMMENTS_DB.prepare(
      `SELECT parent_id, COUNT(*) AS count
         FROM comments WHERE chapter = ? AND parent_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY parent_id`,
    ).bind(chapter).all();
    const replyCounts = Object.fromEntries((replyRows.results || []).map((row) => [row.parent_id, Number(row.count)]));
    return json({ ...summary, comments, replyCounts });
  } catch {
    return errorResponse("Comments are temporarily unavailable.", 503);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return errorResponse("Sign in with Discord to comment.", 401);
  if (!allowRequest(request, user)) return errorResponse("Too many requests. Please try again later.", 429);
  let input;
  try {
    input = await request.json();
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }
  const chapter = normalizeChapter(input?.chapter);
  const body = String(input?.body || "").trim();
  const bodyError = validateBody(body);
  if (!validChapter(chapter)) return errorResponse("Invalid chapter.", 400);
  if (bodyError) return errorResponse(bodyError, 400);
  const parentId = input?.parentId == null ? null : Number(input.parentId);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId < 1)) {
    return errorResponse("Invalid reply target.", 400);
  }
  try {
    if (parentId !== null) {
      const parent = await env.COMMENTS_DB.prepare(
        "SELECT id, chapter, parent_id FROM comments WHERE id = ? AND deleted_at IS NULL",
      ).bind(parentId).first();
      if (!parent || parent.chapter !== chapter) return errorResponse("Reply target not found.", 404);
      if (parent.parent_id !== null) return errorResponse("Replies can only target top-level comments.", 400);
    }
    const createdAt = nowIso();
    const result = await env.COMMENTS_DB.prepare(
      `INSERT INTO comments (chapter, user_id, parent_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(chapter, user.id, parentId, body, createdAt).run();
    const row = await env.COMMENTS_DB.prepare(
      `SELECT c.id, c.chapter, c.parent_id, c.body, c.is_legacy, c.created_at, c.updated_at,
              u.id AS user_id, u.provider, u.provider_user_id, u.login, u.display_name,
              u.avatar_url, u.is_admin, u.is_legacy AS user_is_legacy
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    ).bind(result.meta.last_row_id).first();
    const comment = (await commentsWithReactions(env, [row], user))[0];
    try {
      await notifyDiscord(env, commentEmbed(comment, user, new URL(request.url).origin));
    } catch (error) {
      console.error("Native comment notification failed:", error);
    }
    return json({ comment }, 201);
  } catch {
    return errorResponse("Comment could not be saved.", 503);
  }
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return errorResponse("Method not allowed.", 405);
}
