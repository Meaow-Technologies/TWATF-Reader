import {
  currentUser,
  errorResponse,
  isAdmin,
  json,
  nowIso,
  validateBody,
  allowRequest,
} from "../../_lib/comments.js";

export async function onRequestPatch({ request, env, params }) {
  const user = await currentUser(request, env);
  if (!user) return errorResponse("Sign in with Discord to edit comments.", 401);
  if (!allowRequest(request, user)) return errorResponse("Too many requests. Please try again later.", 429);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return errorResponse("Invalid comment.", 400);
  let input;
  try { input = await request.json(); } catch { return errorResponse("Invalid JSON body.", 400); }
  const body = String(input?.body || "").trim();
  const bodyError = validateBody(body);
  if (bodyError) return errorResponse(bodyError, 400);
  const comment = await env.COMMENTS_DB.prepare(
    "SELECT user_id FROM comments WHERE id = ? AND deleted_at IS NULL",
  ).bind(id).first();
  if (!comment) return errorResponse("Comment not found.", 404);
  if (comment.user_id !== user.id && !isAdmin(user)) return errorResponse("You cannot edit this comment.", 403);
  await env.COMMENTS_DB.prepare(
    "UPDATE comments SET body = ?, updated_at = ? WHERE id = ?",
  ).bind(body, nowIso(), id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const user = await currentUser(request, env);
  if (!user) return errorResponse("Sign in with Discord to delete comments.", 401);
  if (!allowRequest(request, user)) return errorResponse("Too many requests. Please try again later.", 429);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return errorResponse("Invalid comment.", 400);
  const comment = await env.COMMENTS_DB.prepare(
    "SELECT user_id FROM comments WHERE id = ? AND deleted_at IS NULL",
  ).bind(id).first();
  if (!comment) return errorResponse("Comment not found.", 404);
  if (comment.user_id !== user.id && !isAdmin(user)) return errorResponse("You cannot delete this comment.", 403);
  await env.COMMENTS_DB.prepare(
    "UPDATE comments SET deleted_at = ?, body = '[deleted]', updated_at = ? WHERE id = ?",
  ).bind(nowIso(), nowIso(), id).run();
  return json({ ok: true });
}

export function onRequest(context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return errorResponse("Method not allowed.", 405);
}
