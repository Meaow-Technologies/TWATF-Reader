import {
  cookieHeader,
  errorResponse,
  json,
  redirect,
  safeReturnTo,
  signedState,
  randomToken,
} from "../../_lib/comments.js";

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID || !env.SESSION_SECRET) {
    return errorResponse("Discord authentication is not configured.", 503);
  }
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const secure = url.protocol === "https:";
  const state = await signedState(
    { nonce: randomToken(16), returnTo, exp: Date.now() + 10 * 60_000 },
    env.SESSION_SECRET,
  );
  const redirectUri = `${url.origin}/api/auth/discord/callback`;
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state,
  });
  return redirect(authorize.toString(), {
    "Set-Cookie": cookieHeader("twatf_oauth_state", state, { maxAge: 600, secure }),
  });
}

export function onRequest(context) {
  const { request } = context;
  return request.method === "GET"
    ? onRequestGet(context)
    : json({ error: "Method not allowed." }, 405);
}
