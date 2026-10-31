import {
  allowRequest,
  currentUser,
  errorResponse,
  json,
} from "../../../_lib/comments.js";
import { loadVoteSummaries, setCommentVote } from "../../../_lib/votes.js";

export async function onRequestPost({ request, env, params }) {
  if (!env.COMMENTS_DB) return errorResponse("Voting is temporarily unavailable. Please try again later.", 503);
  let user;
  try {
    user = await currentUser(request, env);
  } catch (error) {
    console.error("Comment vote authentication could not be checked:", error);
    return errorResponse("Voting is temporarily unavailable. Please try again later.", 503);
  }
  if (!user) return errorResponse("Sign in with Discord to vote.", 401);
  if (!allowRequest(request, user, "votes", 60)) {
    return errorResponse("Too many requests. Please try again later.", 429);
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return errorResponse("Invalid comment.", 400);
  let input;
  try {
    input = await request.json();
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }
  if (![1, -1, 0].includes(input?.value)) return errorResponse("Invalid vote.", 400);
  try {
    const comment = await env.COMMENTS_DB.prepare(
      "SELECT id FROM comments WHERE id = ? AND deleted_at IS NULL",
    ).bind(id).first();
    if (!comment) return errorResponse("Comment not found.", 404);
    await setCommentVote(env, id, user.id, input.value);
    const votes = await loadVoteSummaries(env, [id], user);
    return json({ votes: votes.get(id) });
  } catch (error) {
    console.error("Comment vote could not be saved:", error);
    return errorResponse("Voting is temporarily unavailable. Please try again later.", 503);
  }
}

export function onRequest(context) {
  return context.request.method === "POST"
    ? onRequestPost(context)
    : errorResponse("Method not allowed.", 405);
}
