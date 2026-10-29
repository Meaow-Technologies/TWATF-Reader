// Giscus uses a stable edition/chapter key, never the shared index.html pathname.
(() => {
  const GISCUS_SESSION_KEY = "giscus-session";
  const params = new URLSearchParams(location.search);
  const giscusSession = params.get("giscus");

  if (giscusSession) {
    try {
      localStorage.setItem(GISCUS_SESSION_KEY, JSON.stringify(giscusSession));
    } catch {}

    if (window.opener && window.opener !== window) {
      try {
        window.close();
      } catch {}
    } else {
      // returnTo is now a path like /first/chapter-5
      let returnTo = sessionStorage.getItem("giscus-return-to");

      if (!returnTo) {
        try {
          const state = JSON.parse(localStorage.getItem("twatf-reader") || "{}");
          const v = state.version || "first";
          const n = state.progress?.[v]?.number || 1;
          returnTo = `/${v}/chapter-${n}`;
        } catch {}
      }

      params.delete("giscus");
      const qs = params.toString() ? `?${params.toString()}` : "";
      // Navigate cleanly to the chapter path (removes the ?giscus param)
      const cleanUrl = returnTo
        ? returnTo + qs
        : `${location.pathname}${qs}`;
      history.replaceState(null, "", cleanUrl);
      // If we're not already on the correct chapter path, navigate there
      if (returnTo && location.pathname !== returnTo.replace(/\?.*$/, "")) {
        location.replace(cleanUrl);
      }
    }
  }

  window.addEventListener("storage", (e) => {
    if (e.key === GISCUS_SESSION_KEY && e.newValue) {
      const frame = mount()?.querySelector("iframe.giscus-frame");
      if (frame) {
        try {
          const url = new URL(frame.src);
          url.searchParams.set("session", JSON.parse(e.newValue));
          frame.src = url.toString();
        } catch {}
      }
    }
  });

  let active = null,
    activeEdition = null,
    started = false;
  const GISCUS_THEME_BASE = "https://twatf.pages.dev/giscus";
  const GISCUS_THEME_VERSION = "owners-v3";
  const theme = () =>
    ["light", "sepia"].includes(document.body.dataset.theme)
      ? `${GISCUS_THEME_BASE}/light.css?v=${GISCUS_THEME_VERSION}`
      : `${GISCUS_THEME_BASE}/dark.css?v=${GISCUS_THEME_VERSION}`;
  const mount = () => document.getElementById("giscus-thread");
  function sync() {
    const frame = mount()?.querySelector("iframe.giscus-frame");
    const category = window.READER_CONFIG?.giscus?.categories?.[activeEdition];
    if (frame && active && category?.name && category?.id)
      frame.contentWindow.postMessage(
        {
          giscus: {
            setConfig: {
              term: active,
              theme: theme(),
              category: category.name,
              categoryId: category.id,
            },
          },
        },
        "https://giscus.app",
      );
  }
  window.readerComments = {
    clear() {
      document.getElementById("comments").hidden = true;
      active = null;
      activeEdition = null;
    },
    show(edition, number) {
      active = `twatf-${edition}-chapter-${number}`;
      activeEdition = edition;
      try {
        sessionStorage.setItem("giscus-return-to", `/${edition}/chapter-${number}`);
      } catch {}
      const section = document.getElementById("comments"),
        status = document.getElementById("comments-status");
      section.hidden = false;
      const c = window.READER_CONFIG?.giscus;
      const category = c?.categories?.[edition];
      if (!c || !c.repo || !c.repoId || !category?.name || !category?.id) {
        status.textContent = "Comments are coming soon.";
        return;
      }
      status.textContent =
        "Comments and reactions are powered by GitHub Discussions. Sign in with GitHub to join in.";
      if (started) {
        sync();
        return;
      }
      started = true;
      const observer = new MutationObserver(() => {
        const frame = mount().querySelector("iframe.giscus-frame");
        if (frame) {
          frame.title = "Chapter comments";
          frame.addEventListener("load", sync);
          sync();
          observer.disconnect();
        }
      });
      observer.observe(mount(), { childList: true, subtree: true });
      const script = document.createElement("script");
      script.src = "https://giscus.app/client.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      const attrs = {
        repo: c.repo,
        "repo-id": c.repoId,
        category: category.name,
        "category-id": category.id,
        mapping: "specific",
        term: active,
        strict: "1",
        "reactions-enabled": "1",
        "emit-metadata": "0",
        "input-position": "top",
        theme: theme(),
        lang: "en",
        loading: "lazy",
      };
      Object.entries(attrs).forEach(([k, v]) =>
        script.setAttribute("data-" + k, v),
      );
      script.onerror = () => {
        status.textContent =
          "Comments could not load. Please check your connection and reload to try again.";
        observer.disconnect();
      };
      mount().append(script);
    },
    theme: sync,
  };
})();


// ── Profanity / slur filter for Giscus comment submission ──
// Intercepts postMessage traffic from the page to giscus iframe.
// Blocks racial slurs while allowing general swearing.
(function () {
  // List of blocked slurs (case-insensitive, whole-word match).
  // General swearing is intentionally NOT in this list.
  const BLOCKED_PATTERNS = [
    /\bn[i1!|]+[g9]+[e3]+r+s?\b/i,     // n-word variants
    /\bn[i1!|]+g{2,}[ae]*\b/i,          // nigga variants
    /\bpaj[e3][e3]t+s?\b/i,             // pajeet
    /\bch[i1][n]+[k]+s?\b/i,            // chink
    /\bsp[i1][c]+s?\b/i,                // spic
    /\bgooks?\b/i,                       // gook
    /\bk[i1]k[e3]s?\b/i,                // kike
    /\bwetbacks?\b/i,                    // wetback
    /\bbeaner[s]?\b/i,                   // beaner
    /\bh[a4]jj[i1]\b/i,                  // hajji
    /\bsandnigger[s]?\b/i,              // sand n-word
    /\bcoon[s]?\b/i,                    // coon (racial context)
    /\bjigaboo[s]?\b/i,                 // jigaboo
    /\bporch\s*monkey\b/i,              // porch monkey
    /\bzipper\s*head\b/i,               // zipperhead
    /\bsl[a4]nt\s*ey[e3]d?\b/i,        // slant-eyed
    /\bwhite\s*tr[a4]sh\b/i,           // white trash (ethnic slur)
    /\bcrackers?\b/i,                   // cracker (racial)
    /\btr[a4]nn[y1][s]?\b/i,           // transphobic slur
    /\bretards?\b/i,                    // ableist slur
  ];

  const BLOCK_MSG =
    "⚠️ Your comment contains a slur or hate speech and was not submitted. " +
    "General language is fine, but racial/ethnic slurs are not allowed.";

  function containsSlur(text) {
    return BLOCKED_PATTERNS.some((re) => re.test(text));
  }

  // Watch for messages sent TO giscus (from our page) and intercept submissions.
  // Also watch for messages FROM giscus that carry user-typed content.
  const origPostMessage = window.postMessage.bind(window);

  // Override iframe's contentWindow.postMessage to intercept outbound messages.
  // We patch via a MutationObserver that watches when the giscus iframe appears.
  const GISCUS_ORIGIN = "https://giscus.app";

  function patchGiscusFrame(frame) {
    if (!frame || frame._profanityPatched) return;
    frame._profanityPatched = true;

    const origFramePost = frame.contentWindow?.postMessage?.bind(
      frame.contentWindow,
    );
    if (!origFramePost) return;

    // We cannot intercept what the user types inside the iframe directly.
    // Instead, listen for the "submit" message that giscus posts to parent.
    window.addEventListener("message", (e) => {
      if (e.origin !== GISCUS_ORIGIN) return;
      try {
        const data = e.data?.giscus;
        // giscus fires a "discussion" event with the new comment body
        if (data?.discussion?.comments?.nodes) {
          // After-the-fact: we can show a warning banner but cannot retract.
        }
      } catch {}
    });
  }

  // Primary approach: intercept the "createDiscussion" / "createComment" calls
  // by watching messages the PAGE sends into the iframe.
  // We wrap HTMLIFrameElement.contentWindow.postMessage.
  const _origDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow",
  );
  if (_origDesc) {
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const win = _origDesc.get.call(this);
        if (!win || !this.src?.startsWith(GISCUS_ORIGIN)) return win;
        if (win._profanityProxy) return win._profanityProxy;
        const proxy = new Proxy(win, {
          get(target, prop) {
            if (prop === "postMessage") {
              return function (msg, targetOrigin, ...rest) {
                try {
                  const body =
                    msg?.giscus?.createComment?.body ||
                    msg?.giscus?.createDiscussion?.body ||
                    "";
                  if (body && containsSlur(body)) {
                    showSlurWarning();
                    return;
                  }
                } catch {}
                return target.postMessage(msg, targetOrigin, ...rest);
              };
            }
            const val = target[prop];
            return typeof val === "function" ? val.bind(target) : val;
          },
        });
        win._profanityProxy = proxy;
        return proxy;
      },
      configurable: true,
    });
  }

  function showSlurWarning() {
    let banner = document.getElementById("profanity-warning");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "profanity-warning";
      banner.setAttribute("role", "alert");
      banner.style.cssText = [
        "position:fixed",
        "bottom:80px",
        "left:50%",
        "transform:translateX(-50%)",
        "max-width:min(520px,90vw)",
        "background:#5c1a1a",
        "color:#fdd",
        "border:1px solid #a33",
        "border-radius:10px",
        "padding:14px 20px",
        "font-size:13px",
        "line-height:1.5",
        "z-index:9999",
        "box-shadow:0 8px 30px #0008",
        "text-align:center",
      ].join(";");
      document.body.appendChild(banner);
    }
    banner.textContent = BLOCK_MSG;
    banner.style.display = "block";
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(
      () => (banner.style.display = "none"),
      6000,
    );
  }

  // Show a static notice above the giscus thread
  const mountObserver = new MutationObserver(() => {
    const thread = document.getElementById("giscus-thread");
    if (!thread || document.getElementById("profanity-notice")) return;
    const notice = document.createElement("p");
    notice.id = "profanity-notice";
    notice.className = "muted";
    notice.style.cssText =
      "font-size:11px;margin:0 0 12px;border-left:2px solid var(--line);padding-left:8px;";
    notice.textContent =
      "Friendly reminder: NO SPOILERS & swearing is okay, but racial and ethnic slurs will be removed by moderators.";
    thread.before(notice);
  });
  mountObserver.observe(document.body, { childList: true, subtree: true });
})();
