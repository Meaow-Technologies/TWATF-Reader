-- Permanently deletes reactions for retired emojis.
DELETE FROM reactions WHERE emoji IN ('👍', '👎', '🚀');
DELETE FROM chapter_reactions WHERE emoji IN ('👍', '👎', '🚀');
