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
    return ["light", "sepia"].includes(document.body.dataset.theme)
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
      credentials: "same-origin",
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

  function loginUrl() {
    return `/api/auth/discord?returnTo=${encodeURIComponent(location.pathname)}`;
  }

  function userHeader() {
    if (currentUser) {
      const avatar = currentUser.avatarUrl
        ? `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="" class="native-comment-avatar">`
        : '<span class="native-comment-avatar"></span>';
      return `<div class="native-comments-user">${avatar}<span>${escapeHtml(currentUser.displayName)}</span>
        <a class="native-comment-action" href="/api/auth/logout?returnTo=${encodeURIComponent(location.pathname)}">Sign out</a></div>`;
    }
    return `<a class="native-comments-login" href="${loginUrl()}">Sign in with Discord</a>`;
  }

  function reactionButtons(reactions, commentId, chapter = false) {
    const existing = new Map((reactions || []).map((reaction) => [reaction.emoji, reaction]));
    const buttons = [...existing.values()]
      .filter((reaction) => reaction.count)
      .map((reaction) => `<button class="native-reaction${reaction.mine ? " mine" : ""}" data-action="react"
        data-id="${commentId || ""}" data-emoji="${escapeHtml(reaction.emoji)}" ${chapter ? 'data-chapter-reaction="true"' : ""}>
        ${escapeHtml(reaction.emoji)} ${reaction.count}</button>`)
      .join("");
    if (!currentUser) return buttons;
    return `${buttons}<button class="native-reaction" data-action="react-picker" data-id="${commentId || ""}"
      ${chapter ? 'data-chapter-reaction="true"' : ""} aria-label="Add reaction">＋</button>`;
  }

  function commentHtml(comment, compact = false) {
    const avatar = comment.author.avatarUrl
      ? `<img src="${escapeHtml(comment.author.avatarUrl)}" alt="" class="native-comment-avatar">`
      : '<span class="native-comment-avatar"></span>';
    const controls = currentUser
      ? `<button class="native-comment-action" data-action="reply" data-id="${comment.id}">Reply</button>`
      : "";
    const ownerControls = currentUser &&
      (currentUser.id === comment.author.id || currentUser.isAdmin)
      ? `<button class="native-comment-action" data-action="edit" data-id="${comment.id}">Edit</button>
         <button class="native-comment-action" data-action="delete" data-id="${comment.id}">Delete</button>`
      : "";
    return `<article class="native-comment${compact ? " native-comment-compact" : ""}" data-comment-id="${comment.id}">
      <div class="native-comment-head">${avatar}
        <span class="native-comment-name">${escapeHtml(comment.author.displayName)}</span>
        <span class="native-comment-time" title="${escapeHtml(comment.createdAt)}">${relativeTime(comment.createdAt)}</span>
        ${comment.edited ? '<span class="native-comment-time">· edited</span>' : ""}
        ${comment.isLegacy ? '<span class="native-comment-legacy">legacy</span>' : ""}
      </div>
      <div class="native-comment-body">${markdown(comment.body)}</div>
      <div class="native-comment-actions">
        <span class="native-reaction-row">${reactionButtons(comment.reactions, comment.id)}</span>
        ${controls}${ownerControls}
        ${replyCounts[comment.id] ? `<button class="native-reply-toggle" data-action="replies" data-id="${comment.id}">
          ${expandedReplies.has(comment.id) ? "Hide" : "View"} ${replyCounts[comment.id]} ${replyCounts[comment.id] === 1 ? "reply" : "replies"}</button>` : ""}
      </div>
      ${expandedReplies.has(comment.id) ? `<div class="native-replies" data-replies="${comment.id}"></div>` : ""}
    </article>`;
  }

  function composeHtml() {
    if (!currentUser) {
      return '<div class="native-empty">Sign in with Discord to join the discussion.</div>';
    }
    return `<form class="native-comment-compose" data-compose>
      <textarea name="body" maxlength="4000" placeholder="Write a comment…"></textarea>
      <div class="native-comments-toolbar">
        <small class="muted">Markdown is supported. Hate speech and slurs are not allowed.</small>
        <button class="native-comment-submit" type="submit">Comment</button>
      </div>
    </form>`;
  }

  function render() {
    if (!nativeMount()) return;
    const roots = comments.filter((comment) => !comment.parentId);
    const chapterReactions = window._nativeChapterReactions || [];
    nativeMount().innerHTML = `<div class="native-comments-card">
      <div class="native-comments-toolbar"><strong>${roots.length ? `${roots.length} comment${roots.length === 1 ? "" : "s"}` : "Comments"}</strong>${userHeader()}</div>
      ${currentUser ? `<div class="native-reaction-row">${reactionButtons(chapterReactions, "", true)}</div>` : ""}
      ${composeHtml()}
      ${loaded
        ? roots.length
          ? `<ul class="native-comment-list">${roots.map((comment) => `<li>${commentHtml(comment)}</li>`).join("")}</ul>`
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
        const article = target.closest("[data-comment-id]");
        if (article.querySelector("[data-reply-form]")) return;
        const form = document.createElement("form");
        form.className = "native-comment-compose";
        form.dataset.replyForm = "true";
        form.innerHTML = '<textarea maxlength="4000" placeholder="Write a reply…"></textarea><button class="native-comment-submit" type="submit">Reply</button>';
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          submitComment(form, id);
        });
        article.append(form);
        return;
      }
      if (action === "delete") {
        if (!confirm("Delete this comment?")) return;
        await request(`/api/comments/${id}`, { method: "DELETE" });
        await refresh();
        return;
      }
      if (action === "edit") {
        const article = target.closest("[data-comment-id]");
        const comment = comments.find((item) => item.id === id);
        if (!comment) return;
        const form = document.createElement("form");
        form.className = "native-comment-compose";
        form.innerHTML = `<textarea class="native-comment-edit" maxlength="4000">${escapeHtml(comment.body)}</textarea><button class="native-comment-submit" type="submit">Save</button>`;
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          await request(`/api/comments/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ body: form.querySelector("textarea").value }),
          });
          await refresh();
        });
        article.querySelector(".native-comment-body").replaceWith(form);
        return;
      }
      if (action === "react-picker") {
        const picker = document.createElement("span");
        picker.className = "native-reaction-row";
        picker.innerHTML = EMOJIS.map((emoji) => `<button class="native-reaction" data-action="react"
          data-id="${id}" ${target.dataset.chapterReaction ? 'data-chapter-reaction="true"' : ""} data-emoji="${emoji}">${emoji}</button>`).join("");
        target.replaceWith(picker);
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
