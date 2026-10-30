"use strict";

(() => {
  const GISCUS_THEME_BASE = "https://twatf.pages.dev/giscus";
  const GISCUS_THEME_VERSION = "owners-v3";
  const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀", "🚀", "👎"];
  let activeChapter = null;
  let activeEdition = null;
  let currentUser = null;
  let comments = [];
  let replyCounts = {};
  let expandedReplies = new Set();
  let loaded = false;
  let giscusStarted = false;

  const $ = (selector) => document.querySelector(selector);
  const nativeMount = () => $("#native-comments");
  const status = () => $("#comments-status");

  function themeUrl() {
    const theme = document.body.dataset.theme || "";
    const isLight = ["light", "sepia"].includes(theme) || theme.endsWith("-light");
    return isLight
      ? `${GISCUS_THEME_BASE}/light.css?v=${GISCUS_THEME_VERSION}`
      : `${GISCUS_THEME_BASE}/dark.css?v=${GISCUS_THEME_VERSION}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function markdown(value) {
    const escaped = escapeHtml(value);
    const lines = escaped.split(/\r?\n/);
    const output = [];
    let list = false;
    for (const line of lines) {
      if (/^\s*[-*]\s+/.test(line)) {
        if (!list) output.push("<ul>");
        list = true;
        output.push(`<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`);
        continue;
      }
      if (list) {
        output.push("</ul>");
        list = false;
      }
      output.push(line ? `<p>${line}</p>` : "");
    }
    if (list) output.push("</ul>");
    return output.join("")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/https?:\/\/[^\s<]+/g, (url) => {
        const safe = url.replace(/[)"'<>]+$/, "");
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
      });
  }

  function relativeTime(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "";
    const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(time).toLocaleDateString();
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    const contentType = response.headers.get("content-type") || "";
    let data = {};
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = {};
      }
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  const SMILE_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11v1a10 10 0 1 1-9-10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M16 5h6"/><path d="M19 2v6"/></svg>`;
  const DISCORD_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`;

  function loginUrl() {
    return `/api/auth/discord?returnTo=${encodeURIComponent(location.pathname)}`;
  }

  function userHeader() {
    if (currentUser) {
      const avatar = currentUser.avatarUrl
        ? `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="" class="native-comment-avatar">`
        : '<span class="native-comment-avatar"></span>';
      return `<div class="native-comments-user">${avatar}<span>${escapeHtml(currentUser.displayName)}</span>
        <a class="native-user-signout" href="/api/auth/logout?returnTo=${encodeURIComponent(location.pathname)}" title="Sign out">Sign out</a></div>`;
    }
    return `<a class="native-comments-login" href="${loginUrl()}">${DISCORD_ICON} Sign in with Discord</a>`;
  }

  function reactionButtons(reactions, commentId, chapter = false) {
    const existing = new Map((reactions || []).map((reaction) => [reaction.emoji, reaction]));
    const buttons = [...existing.values()]
      .filter((reaction) => reaction.count)
      .map((reaction) => `<button class="native-reaction${reaction.mine ? " mine" : ""}" data-action="react"
        data-id="${commentId || ""}" data-emoji="${escapeHtml(reaction.emoji)}" ${chapter ? 'data-chapter-reaction="true"' : ""}>
        <span>${escapeHtml(reaction.emoji)}</span> <span class="native-reaction-count">${reaction.count}</span></button>`)
      .join("");
    if (!currentUser) return buttons;
    return `${buttons}<button class="native-reaction native-reaction-add" data-action="react-picker" data-id="${commentId || ""}"
      ${chapter ? 'data-chapter-reaction="true"' : ""} aria-label="Add reaction" title="Add reaction">${SMILE_ICON}</button>`;
  }

  function chapterReactionsHtml(reactions) {
    const hasReactions = (reactions || []).some((r) => r.count > 0);
    if (!hasReactions && !currentUser) return "";
    return `<div class="native-chapter-reactions">
      <div class="native-chapter-reactions-row">
        ${reactionButtons(reactions, "", true)}
        ${!hasReactions && currentUser ? '<span class="native-chapter-reactions-prompt">React to this chapter</span>' : ""}
      </div>
      <div class="native-chapter-picker" id="chapter-picker" style="display:none;">
        ${EMOJIS.map((emoji) => `<button type="button" class="native-picker-emoji" data-action="react" data-chapter-reaction="true" data-emoji="${emoji}">${emoji}</button>`).join("")}
      </div>
    </div>`;
  }

  function commentHtml(comment, compact = false) {
    const avatar = comment.author.avatarUrl
      ? `<img src="${escapeHtml(comment.author.avatarUrl)}" alt="" class="native-comment-avatar${compact ? " native-comment-avatar-sm" : ""}" loading="lazy">`
      : `<div class="native-comment-avatar${compact ? " native-comment-avatar-sm" : ""}"></div>`;
    const controls = currentUser && !compact
      ? `<button class="native-comment-action" data-action="reply" data-id="${comment.id}">Reply</button>`
      : "";
    const ownerControls = currentUser &&
      (currentUser.id === comment.author.id || currentUser.isAdmin)
      ? `<button class="native-comment-action" data-action="edit" data-id="${comment.id}">Edit</button>
         <button class="native-comment-action native-action-delete" data-action="delete" data-id="${comment.id}">Delete</button>`
      : "";
    return `<div class="native-comment${compact ? " native-comment-compact" : ""}" data-comment-id="${comment.id}">
      ${avatar}
      <div class="native-comment-content">
        <div class="native-comment-head">
          <span class="native-comment-name">${escapeHtml(comment.author.displayName)}</span>
          ${comment.author.provider === "discord"
            ? `<span class="native-badge native-badge-discord">${DISCORD_ICON} Discord</span>`
            : `<span class="native-badge">GitHub</span>`}
          ${comment.author.isLegacy ? '<span class="native-badge native-badge-legacy">legacy</span>' : ""}
          <span class="native-comment-time" title="${escapeHtml(comment.createdAt)}">${relativeTime(comment.createdAt)}</span>
          ${comment.edited ? '<span class="native-comment-edited">· edited</span>' : ""}
        </div>
        <div class="native-comment-body">${markdown(comment.body)}</div>
        <div class="native-comment-actions">
          <div class="native-reaction-row">${reactionButtons(comment.reactions, comment.id)}</div>
          ${controls}${ownerControls}
        </div>
        ${!compact && replyCounts[comment.id] ? `<button class="native-reply-toggle${expandedReplies.has(comment.id) ? " expanded" : ""}" data-action="replies" data-id="${comment.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="native-reply-chevron"><path d="m6 9 6 6 6-6"/></svg>
          ${expandedReplies.has(comment.id) ? "Hide replies" : `View ${replyCounts[comment.id]} ${replyCounts[comment.id] === 1 ? "reply" : "replies"}`}</button>` : ""}
        ${expandedReplies.has(comment.id) ? `<div class="native-replies" data-replies="${comment.id}"></div>` : ""}
      </div>
    </div>`;
  }

  function composeHtml() {
    if (!currentUser) {
      return `<div class="native-empty-login">
        <p>Sign in with Discord to react and join the discussion.</p>
        <a class="native-comments-login" href="${loginUrl()}">${DISCORD_ICON} Sign in with Discord</a>
      </div>`;
    }
    const avatar = currentUser.avatarUrl
      ? `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="" class="native-comment-avatar">`
      : '<div class="native-comment-avatar"></div>';
    return `<div class="native-compose-card">
      ${avatar}
      <form class="native-comment-compose" data-compose>
        <textarea name="body" maxlength="4000" rows="3" placeholder="Write a comment…"></textarea>
        <div class="native-compose-footer">
          <small class="muted">Markdown supported. Hate speech &amp; slurs prohibited.</small>
          <button class="native-comment-submit" type="submit">Comment</button>
        </div>
      </form>
    </div>`;
  }

  function render() {
    if (!nativeMount()) return;
    const roots = comments.filter((comment) => !comment.parentId);
    const chapterReactions = window._nativeChapterReactions || [];
    nativeMount().innerHTML = `<div class="native-comments-card">
      ${chapterReactionsHtml(chapterReactions)}
      <div class="native-comments-topbar">
        <div class="native-comments-title-wrap">
          <span class="native-comments-label">Comments</span>
          <span class="native-comments-count-pill">${roots.length}</span>
        </div>
        ${userHeader()}
      </div>
      ${composeHtml()}
      ${loaded
        ? roots.length
          ? `<div class="native-comment-list">${roots.map((comment) => commentHtml(comment)).join("")}</div>`
          : '<div class="native-empty">No comments yet. Be the first!</div>'
        : '<button class="native-comment-submit" data-action="load">Load comments</button>'}
    </div>`;
    for (const root of roots.filter((comment) => expandedReplies.has(comment.id))) {
      loadReplies(root.id);
    }
  }

  async function loadReplies(id) {
    const target = nativeMount().querySelector(`[data-replies="${id}"]`);
    if (!target || target.dataset.loaded) return;
    target.textContent = "Loading replies…";
    try {
      const data = await request(`/api/comments/${id}/replies`);
      target.innerHTML = data.comments.map((comment) => commentHtml(comment, true)).join("");
      target.dataset.loaded = "true";
    } catch (error) {
      target.textContent = error.message;
    }
  }

  async function loadNative() {
    if (!activeChapter) return;
    try {
      const [me, data, chapterReactions] = await Promise.all([
        request("/api/me"),
        request(`/api/comments?chapter=${encodeURIComponent(activeChapter)}`),
        request(`/api/chapter-reactions?chapter=${encodeURIComponent(activeChapter)}`),
      ]);
      currentUser = me.user;
      comments = data.comments || [];
      replyCounts = data.replyCounts || {};
      window._nativeChapterReactions = chapterReactions.reactions || [];
      loaded = true;
      render();
    } catch (error) {
      nativeMount().innerHTML = `<div class="native-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function refresh() {
    const data = await request(`/api/comments?chapter=${encodeURIComponent(activeChapter)}`);
    comments = data.comments || [];
    replyCounts = data.replyCounts || {};
    render();
  }

  async function submitComment(form, parentId = null) {
    const textarea = form.querySelector("textarea");
    const body = textarea.value.trim();
    if (!body) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await request("/api/comments", {
        method: "POST",
        body: JSON.stringify({ chapter: activeChapter, body, parentId }),
      });
      expandedReplies.delete(parentId);
      await refresh();
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function handleNativeClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const id = Number(target.dataset.id);
    try {
      if (action === "load") return loadNative();
      if (action === "replies") {
        if (expandedReplies.has(id)) expandedReplies.delete(id);
        else expandedReplies.add(id);
        render();
        return;
      }
      if (action === "reply") {
        const commentCard = target.closest("[data-comment-id]");
        if (commentCard.querySelector("[data-reply-form]")) return;
        const form = document.createElement("form");
        form.className = "native-comment-compose native-reply-form";
        form.dataset.replyForm = "true";
        form.innerHTML = `<textarea maxlength="4000" rows="2" placeholder="Write a reply…"></textarea>
          <div class="native-compose-footer">
            <button class="native-comment-cancel" type="button" data-action="cancel-reply">Cancel</button>
            <button class="native-comment-submit" type="submit">Reply</button>
          </div>`;
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          submitComment(form, id);
        });
        commentCard.querySelector(".native-comment-content").append(form);
        form.querySelector("textarea").focus();
        return;
      }
      if (action === "cancel-reply") {
        target.closest("[data-reply-form]")?.remove();
        return;
      }
      if (action === "delete") {
        if (!confirm("Delete this comment?")) return;
        await request(`/api/comments/${id}`, { method: "DELETE" });
        await refresh();
        return;
      }
      if (action === "edit") {
        const commentCard = target.closest("[data-comment-id]");
        const comment = comments.find((item) => item.id === id);
        if (!comment) return;
        const form = document.createElement("form");
        form.className = "native-comment-compose";
        form.innerHTML = `<textarea class="native-comment-edit" maxlength="4000" rows="3">${escapeHtml(comment.body)}</textarea>
          <div class="native-compose-footer">
            <button class="native-comment-cancel" type="button" data-action="cancel-edit">Cancel</button>
            <button class="native-comment-submit" type="submit">Save</button>
          </div>`;
        form.querySelector("[data-action=cancel-edit]").addEventListener("click", () => render());
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          await request(`/api/comments/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ body: form.querySelector("textarea").value }),
          });
          await refresh();
        });
        commentCard.querySelector(".native-comment-body").replaceWith(form);
        form.querySelector("textarea").focus();
        return;
      }
      if (action === "react-picker") {
        if (target.dataset.chapterReaction) {
          const picker = document.getElementById("chapter-picker");
          if (picker) {
            picker.style.display = picker.style.display === "none" ? "flex" : "none";
          }
          return;
        }
        const existingPicker = target.closest(".native-comment-actions")?.querySelector(".native-picker-row");
        if (existingPicker) {
          existingPicker.remove();
          return;
        }
        const picker = document.createElement("div");
        picker.className = "native-picker-row";
        picker.style.display = "flex";
        picker.style.flexWrap = "wrap";
        picker.style.gap = "2px";
        picker.style.marginTop = "4px";
        picker.style.width = "100%";
        picker.innerHTML = EMOJIS.map((emoji) => `<button type="button" class="native-picker-emoji" data-action="react"
          data-id="${id}" data-emoji="${emoji}">${emoji}</button>`).join("");
        target.closest(".native-comment-actions").append(picker);
        return;
      }
      if (action === "react") {
        const emoji = target.dataset.emoji;
        if (target.dataset.chapterReaction) {
          const result = await request("/api/chapter-reactions", {
            method: "POST",
            body: JSON.stringify({ chapter: activeChapter, emoji }),
          });
          window._nativeChapterReactions = result.reactions;
        } else {
          const result = await request(`/api/comments/${id}/reactions/${encodeURIComponent(emoji)}`, { method: "POST" });
          const comment = comments.find((item) => item.id === id);
          if (comment) comment.reactions = result.reactions;
        }
        render();
      }
    } catch (error) {
      alert(error.message);
    }
  }

  function startLegacyGiscus() {
    if (giscusStarted || !activeEdition || !activeChapter) return;
    const config = window.READER_CONFIG?.giscus;
    const category = config?.categories?.[activeEdition];
    if (!config?.repo || !category?.name || !category?.id) return;
    giscusStarted = true;
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    const attrs = {
      repo: config.repo,
      "repo-id": config.repoId,
      category: category.name,
      "category-id": category.id,
      mapping: "specific",
      term: `twatf-${activeEdition}-chapter-${activeChapter.split(":")[1]}`,
      strict: "1",
      "reactions-enabled": "1",
      "emit-metadata": "0",
      "input-position": "top",
      theme: themeUrl(),
      lang: "en",
      loading: "lazy",
    };
    Object.entries(attrs).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));
    $("#giscus-thread")?.append(script);
  }

  function syncGiscusTheme() {
    const frame = $("#giscus-thread iframe.giscus-frame");
    if (!frame) return;
    frame.contentWindow.postMessage({ giscus: { setConfig: { theme: themeUrl() } } }, "https://giscus.app");
  }

  window.readerComments = {
    clear() {
      $("#comments").hidden = true;
      activeChapter = null;
      activeEdition = null;
      currentUser = null;
      comments = [];
      loaded = false;
      giscusStarted = false;
      if (nativeMount()) nativeMount().replaceChildren();
      if ($("#giscus-thread")) $("#giscus-thread").replaceChildren();
    },
    show(edition, number) {
      activeEdition = edition;
      activeChapter = `${edition}:${number}`;
      loaded = false;
      giscusStarted = false;
      expandedReplies = new Set();
      $("#comments").hidden = false;
      status().textContent = "Loading comments…";
      nativeMount().replaceChildren();
      $("#giscus-thread")?.replaceChildren();
      loadNative().finally(() => {
        status().textContent = "Comments are powered by Discord. Legacy GitHub discussions remain available below.";
      });
    },
    theme() {
      syncGiscusTheme();
    },
  };

  $("#native-comments")?.addEventListener("click", handleNativeClick);
  $("#native-comments")?.addEventListener("submit", (event) => {
    if (event.target.matches("[data-compose]")) {
      event.preventDefault();
      submitComment(event.target);
    }
  });
  $("#legacy-comments")?.addEventListener("toggle", (event) => {
    if (event.target.open) startLegacyGiscus();
  });
})();
