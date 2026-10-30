import { currentUser, errorResponse, json } from "../_lib/comments.js";

export async function onRequestGet({ request, env }) {
  try {
    return json({ user: await currentUser(request, env) });
  } catch {
    return errorResponse("Unable to load the current user.", 503);
  }
}

export function onRequest({ request, env }) {
  return request.method === "GET"
    ? onRequestGet({ request, env })
    : errorResponse("Method not allowed.", 405);
}
