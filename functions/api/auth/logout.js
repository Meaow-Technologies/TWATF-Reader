import { cookieHeader, cookieValue, currentUser, errorResponse, redirect, safeReturnTo } from "../../_lib/comments.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const user = await currentUser(request, env);
  if (user) {
    const token = cookieValue(request, "twatf_session");
    await env.COMMENTS_DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }
  return redirect(`${url.origin}${safeReturnTo(url.searchParams.get("returnTo"))}`, {
    "Set-Cookie": cookieHeader("twatf_session", "", { maxAge: 0 }),
  });
}

export function onRequest({ request }) {
  return request.method === "GET"
    ? onRequestGet
    : errorResponse("Method not allowed.", 405);
}
