import { currentUser, errorResponse, json } from "../../../_lib/comments.js";
import { formatCommentWithReactions } from "../../../_lib/reactions.js";

export async function onRequestGet({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return errorResponse("Invalid comment.", 400);
  try {
    const user = await currentUser(request, env);
    const rows = await env.COMMENTS_DB.prepare(
      `SELECT c.id, c.chapter, c.parent_id, c.body, c.is_legacy, c.created_at, c.updated_at,
              u.id AS user_id, u.provider, u.provider_user_id, u.login, u.display_name,
              u.avatar_url, u.is_admin, u.is_legacy AS user_is_legacy
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.parent_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at ASC, c.id ASC`,
    ).bind(id).all();
    const comments = await formatCommentWithReactions(env, rows.results || [], user);
    return json({ comments, total: comments.length });
  } catch {
    return errorResponse("Replies are temporarily unavailable.", 503);
  }
}

export function onRequest(context) {
  return context.request.method === "GET"
    ? onRequestGet(context)
    : errorResponse("Method not allowed.", 405);
}
