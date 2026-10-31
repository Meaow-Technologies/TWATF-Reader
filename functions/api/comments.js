import {
  commentEmbed,
  currentUser,
  errorResponse,
  json,
  normalizeChapter,
  notifyDiscord,
  nowIso,
  validChapter,
  validateBody,
  allowRequest,
} from "../_lib/comments.js";
import { formatCommentWithReactions } from "../_lib/reactions.js";
import { isMissingVotesTable } from "../_lib/votes.js";

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
  const params = new URL(request.url).searchParams;
  const chapter = normalizeChapter(params.get("chapter"));
  const scope = params.get("scope") || "roots";
  const sort = params.has("sort") ? params.get("sort") : "newest";
  if (!validChapter(chapter)) return errorResponse("Invalid chapter.", 400);
  if (!["popular", "oldest", "newest"].includes(sort)) return errorResponse("Invalid sort.", 400);
  try {
    const user = await currentUser(request, env);
    const summary = await counts(env, chapter);
    if (scope === "count") return json(summary);
    const baseQuery = `SELECT c.id, c.chapter, c.parent_id, c.body, c.is_legacy, c.created_at, c.updated_at,
              u.id AS user_id, u.provider, u.provider_user_id, u.login, u.display_name,
              u.avatar_url, u.is_admin, u.is_legacy AS user_is_legacy
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.chapter = ? AND c.parent_id IS NULL AND c.deleted_at IS NULL`;
    const ordering = {
      popular: `COALESCE((SELECT SUM(v.value) FROM comment_votes v WHERE v.comment_id = c.id), 0) DESC,
                c.created_at DESC, c.id DESC`,
      oldest: "c.created_at ASC, c.id ASC",
      newest: "c.created_at DESC, c.id DESC",
    };
    let rows;
    try {
      rows = await env.COMMENTS_DB.prepare(
        `${baseQuery} ORDER BY ${ordering[sort]} LIMIT 200`,
      ).bind(chapter).all();
    } catch (error) {
      if (sort !== "popular" || !isMissingVotesTable(error)) throw error;
      console.error("Popular comment ordering unavailable; falling back to newest because comment_votes is missing:", error);
      rows = await env.COMMENTS_DB.prepare(
        `${baseQuery} ORDER BY c.created_at DESC, c.id DESC LIMIT 200`,
      ).bind(chapter).all();
    }
    const comments = await formatCommentWithReactions(env, rows.results || [], user);
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
        "SELECT id, chapter FROM comments WHERE id = ? AND deleted_at IS NULL",
      ).bind(parentId).first();
      if (!parent || parent.chapter !== chapter) return errorResponse("Reply target not found.", 404);
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
    const comment = (await formatCommentWithReactions(env, [row], user))[0];
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
