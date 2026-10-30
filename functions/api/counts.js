import { errorResponse, json, normalizeChapter, validChapter } from "../_lib/comments.js";

export async function onRequestGet({ request, env }) {
  const values = new URL(request.url).searchParams.get("chapters")?.split(",") || [];
  const chapters = values.map(normalizeChapter).filter(validChapter).slice(0, 100);
  if (!chapters.length) return json({ counts: {} });
  const rows = await env.COMMENTS_DB.prepare(
    `SELECT chapter, COUNT(*) AS count FROM comments
      WHERE chapter IN (${chapters.map(() => "?").join(",")}) AND deleted_at IS NULL
      GROUP BY chapter`,
  ).bind(...chapters).all();
  return json({ counts: Object.fromEntries((rows.results || []).map((row) => [row.chapter, Number(row.count)])) });
}

export function onRequest(context) {
  return context.request.method === "GET"
    ? onRequestGet(context)
    : errorResponse("Method not allowed.", 405);
}
