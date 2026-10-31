import { formatUser } from "./comments.js";
import { loadVoteSummaries } from "./votes.js";

function formatComment(row, reactions, user) {
  const grouped = new Map();
  for (const reaction of reactions) {
    const item = grouped.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, mine: false, users: [] };
    item.count += 1;
    item.mine ||= reaction.user_id === user?.id;
    if (item.users.length < 20) item.users.push(reaction.display_name);
    grouped.set(reaction.emoji, item);
  }
  return {
    id: row.id,
    chapter: row.chapter,
    parentId: row.parent_id,
    body: row.body,
    isLegacy: Boolean(row.is_legacy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: Boolean(row.updated_at),
    author: formatUser({
      id: row.user_id,
      provider: row.provider,
      provider_user_id: row.provider_user_id,
      login: row.login,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      is_admin: row.is_admin,
      is_legacy: row.user_is_legacy,
    }),
    reactions: [...grouped.values()],
  };
}

export async function formatCommentWithReactions(env, rows, user) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [reactions, votes] = await Promise.all([
    env.COMMENTS_DB.prepare(
      `SELECT r.comment_id, r.user_id, r.emoji, u.display_name
         FROM reactions r JOIN users u ON u.id = r.user_id
        WHERE r.comment_id IN (${ids.map(() => "?").join(",")})`,
    ).bind(...ids).all(),
    loadVoteSummaries(env, ids, user),
  ]);
  const byComment = new Map();
  for (const reaction of reactions.results || []) {
    const list = byComment.get(reaction.comment_id) || [];
    list.push(reaction);
    byComment.set(reaction.comment_id, list);
  }
  return rows.map((row) => ({
    ...formatComment(row, byComment.get(row.id) || [], user),
    votes: votes.get(row.id),
  }));
}
