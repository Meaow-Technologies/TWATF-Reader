import {
  cookieHeader,
  cookieValue,
  createSession,
  errorResponse,
  redirect,
  safeReturnTo,
  upsertDiscordUser,
  verifyState,
} from "../../../../_lib/comments.js";

async function exchangeCode(env, code, redirectUri) {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error("Discord token exchange failed.");
  return response.json();
}

export async function onRequestGet({ request, env }) {
  if (!env.COMMENTS_DB || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return errorResponse("Discord authentication is not configured.", 503);
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = cookieValue(request, "twatf_oauth_state");
  const payload = state && savedState && state === savedState
    ? await verifyState(state, env.SESSION_SECRET)
    : null;
  if (!payload || !code) return errorResponse("Invalid or expired authentication request.", 400);

  try {
    const redirectUri = `${url.origin}/api/auth/discord/callback`;
    const token = await exchangeCode(env, code, redirectUri);
    const profileResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("Discord profile lookup failed.");
    const profile = await profileResponse.json();
    const userId = await upsertDiscordUser(env, profile);
    const secure = url.protocol === "https:";
    const sessionCookie = await createSession(env, userId, secure);
    return redirect(`${url.origin}${safeReturnTo(payload.returnTo)}`, {
      "Set-Cookie": [
        sessionCookie,
        cookieHeader("twatf_oauth_state", "", { maxAge: 0, secure }),
      ].join(", "),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Discord login failed.", 502);
  }
}
