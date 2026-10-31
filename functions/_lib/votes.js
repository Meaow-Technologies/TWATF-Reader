function emptyVoteSummary() {
  return { score: 0, up: 0, down: 0, mine: 0 };
}

export function isMissingVotesTable(error) {
  return /no such table:\s*(?:main\.)?comment_votes/i.test(String(error?.message || error));
}

export async function loadVoteSummaries(env, ids, user) {
  const summaries = new Map(ids.map((id) => [id, emptyVoteSummary()]));
  if (!ids.length) return summaries;
  try {
    const result = await env.COMMENTS_DB.prepare(
      `SELECT comment_id,
              SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up,
              SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down,
              MAX(CASE WHEN user_id = ? THEN value END) AS mine
         FROM comment_votes
        WHERE comment_id IN (${ids.map(() => "?").join(",")})
        GROUP BY comment_id`,
    ).bind(user?.id || null, ...ids).all();
    for (const row of result.results || []) {
      const up = Number(row.up || 0);
      const down = Number(row.down || 0);
      summaries.set(row.comment_id, {
        score: up - down,
        up,
        down,
        mine: Number(row.mine || 0),
      });
    }
  } catch (error) {
    if (!isMissingVotesTable(error)) throw error;
    console.error("Comment vote summaries unavailable; comment_votes table is missing:", error);
  }
  return summaries;
}

export async function setCommentVote(env, commentId, userId, value) {
  if (value === 0) {
    await env.COMMENTS_DB.prepare(
      "DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?",
    ).bind(commentId, userId).run();
    return;
  }
  await env.COMMENTS_DB.prepare(
    `INSERT INTO comment_votes (comment_id, user_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(comment_id, user_id) DO UPDATE SET
       value = excluded.value,
       created_at = CURRENT_TIMESTAMP`,
  ).bind(commentId, userId, value).run();
}
