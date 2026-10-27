"use strict";

// ── Hash/path redirects — run before anything else ──
const _isRedirecting = (() => {
  const h = location.hash;
  const hashMatch = h.match(/^#read\/(first|revised)\/(\d+)$/);
  if (hashMatch) {
    location.replace(`/${hashMatch[1]}/chapter-${hashMatch[2]}`);
    return true;
  }

  const p = location.pathname;
  if (/(?:^|\/)chapters(?:\.html)?\/?$/i.test(p)) {
    const ed = new URLSearchParams(location.search).get("edition");
    if (ed === "first" || ed === "revised") {
      location.replace("/" + ed);
      return true;
    }
  }
  return false;
})();

if (!_isRedirecting) {
const $ = (s) => document.querySelector(s);
let catalog,
  version = "revised",
  current = null,
  currentEdition = null,
  onlyBookmarks = false,
  loadId = 0,
  restoring = false;
let state = {
  version: "revised",
  progress: {},
  bookmarks: [],
  theme: "oled",
  size: 20,
  font: "serif",
};
try {
  Object.assign(
    state,
    JSON.parse(localStorage.getItem("twatf-reader") || "{}"),
  );
} catch {}
version = ["first", "revised"].includes(state.version)
  ? state.version
  : "revised";
function save() {
  try {
    localStorage.setItem("twatf-reader", JSON.stringify(state));
  } catch {}
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2500);
}
const fonts = {
  serif: "Georgia, serif",
  palatino: 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  times: '"Times New Roman", Times, serif',
  "sans-serif": "system-ui, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  mono: 'ui-monospace, "Courier New", monospace',
};
const covers = {
  first: "assets/images/first-cover.webp",
  revised: "assets/images/revised-cover.webp",
};
const epubs = {
  first: "assets/downloads/The_World_After_The_Fall_First_Edition.epub",
  revised: "assets/downloads/The_World_After_The_Fall_Revised.epub",
};

// Derive mode from pathname
function getRouteInfo() {
  const p = location.pathname;
  // /first/chapter-N or /revised/chapter-N
  const chapterMatch = p.match(/^\/(first|revised)\/chapter-(\d+)\/?$/i);
  if (chapterMatch) {
    return { mode: "reader", edition: chapterMatch[1], n: Number(chapterMatch[2]) };
  }
  // /first or /revised (edition page) or /chapters
  if (/^\/(first|revised)\/?$/i.test(p)) {
    const ed = p.replace(/^\//,"").replace(/\/$/,"").toLowerCase();
    return { mode: "index", edition: ed };
  }
  if (/(?:^|\/)chapters(?:\.html)?\/?$/i.test(p)) {
    return { mode: "index", edition: null }; // fallback to saved edition
  }
  // default: home
  return { mode: "home" };
}

const checkIsIndex = () => {
  const { mode } = getRouteInfo();
  return mode === "index";
};

let reverseIndex = false;
function indexRender() {
  if (!catalog) return;
  const p = state.progress[version];
  const resumeN = p?.number || 1;
  $("#index-cover").src = covers[version];
  $("#index-version").value = version;
  $("#index-download").href = epubs[version];
  $("#index-resume").href = `/${version}/chapter-${resumeN}`;
  $("#index-resume").textContent = p
    ? `Continue · Chapter ${p.number} →`
    : "Start reading →";
  $("#index-description").textContent =
    `${version === "first" ? "First edition" : "Revised edition"} · ${catalog[version].length} chapters`;
  const q = $("#index-search").value.trim().toLowerCase();
  let rows = catalog[version].filter(
    (c) => c.title.toLowerCase().includes(q) || String(c.number) === q,
  );
  if (reverseIndex) rows = rows.slice().reverse();
  $("#index-count").textContent = rows.length + " chapters";
  $("#index-results").replaceChildren();
  if (!rows.length) {
    const pEl = document.createElement("p");
    pEl.className = "summary";
    pEl.textContent = "No chapters match your search.";
    $("#index-results").append(pEl);
  }
  rows.forEach((c) => {
    const a = document.createElement("a");
    a.className = "chapter-card";
    a.href = `/${version}/chapter-${c.number}`;
    if (p?.number === c.number) {
      a.classList.add("last-read");
      a.setAttribute("aria-current", "true");
    }
    const label = document.createElement("small");
    label.textContent = `CHAPTER ${c.number}`;
    const h = document.createElement("h3");
    h.textContent = c.title.replace(/^Chapter \d+\s*[-:]?\s*/, "") || c.title;
    const badge = document.createElement("span");
    badge.className = "chapter-badge";
    badge.textContent =
      p?.number === c.number
        ? "LAST READ"
        : `${Math.max(1, Math.round(c.words / 220))} MIN`;
    a.append(label, h, badge);
    $("#index-results").append(a);
  });
}
function goIndex() {
  storePosition();
  location.href = `/${version}`;
}
function support(kind) {
  const donations = kind === "donations";
  const cfg = window.READER_CONFIG || {};
  const url = donations ? cfg.donationUrl : cfg.contributionUrl;
  $("#support-title").textContent = donations
    ? "Support Home"
    : "Contribute to Home";
  $("#support-copy").textContent = donations
    ? "Enjoying the reader? Support helps keep this Home available."
    : "Help improve the reading experience. Report a typo, suggest an improvement, or contribute to the website.";
  const valid = typeof url === "string" && /^https:\/\//i.test(url);
  $("#support-link").hidden = !valid;
  $("#support-link").href = valid ? url : "#";
  $("#support-link").textContent = donations
    ? "Make a donation ↗"
    : "Contribute ↗";
  $("#support-status").textContent = valid
    ? "Thank you for helping this Home grow."
    : donations
      ? "Donations are not available yet."
      : "A contribution link will be added soon.";
  $("#support").showModal();
}
function settings() {
  document.body.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--size", state.size + "px");
  document.documentElement.style.setProperty(
    "--font",
    fonts[state.font] || fonts.serif,
  );
  $("#theme").value = state.theme;
  $("#size").textContent = state.size + " px";
  $("#size-down").disabled = state.size <= 16;
  $("#size-up").disabled = state.size >= 30;
  $("#font").value = state.font;
  window.readerComments?.theme();
}
function choose(v) {
  version = v;
  state.version = v;
  save();
  document.querySelectorAll("[data-version]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.version === v);
    b.setAttribute("aria-pressed", b.dataset.version === v);
  });
  const coverEl = $("#cover");
  if (coverEl) coverEl.src = covers[v];
  const dlEl = $("#download");
  if (dlEl) dlEl.href = epubs[v];
  $("#list-version").value = v;
  const p = state.progress[v];
  // Update the #start link href if it exists as an <a>
  const startEl = $("#start");
  if (startEl) {
    if (startEl.tagName === "A") {
      startEl.href = `/${v}`;
    } else {
      startEl.innerHTML = "Chapters <span>↗</span>";
    }
  }
  const resumeNote = $("#resume-note");
  if (resumeNote) {
    resumeNote.textContent = p
      ? `Continue ${v} edition · Chapter ${p.number}. Your place is saved on this device.`
      : "Your place is saved automatically on this device.";
  }
  updateResumeEditions();
}
function updateResumeEditions() {
  const firstP = state.progress["first"];
  const firstN = firstP?.number || 1;
  const firstEl = $("#resume-first");
  if (firstEl) {
    firstEl.href = `/first/chapter-${firstN}`;
    firstEl.textContent = `First Edition (Chapter ${firstN})`;
  }
  const revP = state.progress["revised"];
  const revN = revP?.number || 1;
  const revEl = $("#resume-revised");
  if (revEl) {
    revEl.href = `/revised/chapter-${revN}`;
    revEl.textContent = `Revised Edition (Chapter ${revN})`;
  }
}
function list() {
  if (!catalog) return;
  const selected = $("#list-version").value;
  const q = $("#search").value.toLowerCase().trim();
  const rows = catalog[selected].filter(
    (c) =>
      (!onlyBookmarks || state.bookmarks.includes(selected + ":" + c.number)) &&
      `${c.number} ${c.title}`.toLowerCase().includes(q),
  );
  $("#chapter-results").replaceChildren();
  $("#count").textContent = rows.length
    ? `${rows.length} ${onlyBookmarks ? "bookmarks" : "chapters"} · ${selected} edition`
    : onlyBookmarks
      ? "No bookmarks here yet. Save one while reading."
      : "No chapters match your search.";
  // Determine current chapter from path
  const { mode, edition: pathEdition, n: pathN } = getRouteInfo();
  rows.forEach((c) => {
    const button = document.createElement("button");
    button.className = "popup-chapter";
    const number = document.createElement("span");
    number.className = "popup-number";
    number.textContent = "#" + c.number;
    const title = document.createElement("span");
    title.className = "popup-title";
    title.textContent =
      c.title.replace(/^Chapter \d+\s*[-:]?\s*/, "") || c.title;
    button.append(number, title);
    if (mode === "reader" && pathEdition === selected && pathN === c.number) {
      button.classList.add("current-chapter");
      button.setAttribute("aria-current", "page");
    }
    if (state.bookmarks.includes(selected + ":" + c.number)) {
      const star = document.createElement("span");
      star.className = "popup-star";
      star.textContent = "★";
      star.setAttribute("aria-label", "Bookmarked");
      button.append(star);
    }
    button.onclick = () => {
      storePosition();
      $("#contents").close();
      location.href = `/${selected}/chapter-${c.number}`;
    };
    $("#chapter-results").append(button);
  });
}
function openList(bookmarks = false) {
  storePosition();
  onlyBookmarks = bookmarks;
  $("#list-title").textContent = bookmarks ? "Your bookmarks" : "Chapters";
  $("#search").value = "";
  $("#list-version").value = version;
  list();
  $("#contents").showModal();
  document.body.classList.add("chapter-popup-open");
  $("#search").focus({ preventScroll: true });
  const active = $("#chapter-results .current-chapter");
  $("#chapter-results").scrollTop = active
    ? active.offsetTop - $("#chapter-results").offsetTop - 80
    : 0;
}
function mark() {
  if (!current) return;
  const on = state.bookmarks.includes(version + ":" + current.number);
  $("#bookmark").textContent = on ? "★ Bookmarked" : "☆ Bookmark";
  $("#bookmark").setAttribute("aria-pressed", on);
}
function storePosition() {
  if (!current || restoring || $("#reader").hidden) return;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const activeEdition = currentEdition;
  if (!["first", "revised"].includes(activeEdition)) return;
  state.progress[activeEdition] = {
    number: current.number,
    ratio: Math.min(1, scrollY / max),
  };
  save();
  updateResumeEditions();
}

// Shared post-load logic (used by prerendered and fetched paths)
function afterChapterLoaded(v, n, entry, idx) {
  window.readerComments.show(v, n);
  try {
    sessionStorage.setItem("giscus-return-to", `/${v}/chapter-${n}`);
  } catch {}
  $("#end-note").textContent =
    idx === catalog[v].length - 1
      ? "You have reached the end of this edition."
      : "";
  const prior = state.progress[v];
  const ratio = prior?.number === n ? prior.ratio || 0 : 0;
  state.progress[v] = { number: n, ratio };
  save();
  updateResumeEditions();
  requestAnimationFrame(() => {
    scrollTo(
      0,
      ratio * Math.max(0, document.documentElement.scrollHeight - innerHeight),
    );
    restoring = false;
  });
}

async function route() {
  const id = ++loadId;
  window.readerComments.clear();
  const routeInfo = getRouteInfo();

  if (routeInfo.mode === "index") {
    current = null;
    currentEdition = null;
    $("#home").hidden = true;
    $("#reader").hidden = true;
    $("#chapter-index").hidden = false;
    const ed = routeInfo.edition;
    if (ed && ["first", "revised"].includes(ed)) {
      choose(ed);
    } else {
      // /chapters fallback: use saved version
      choose(version);
    }
    indexRender();
    return;
  }

  if (routeInfo.mode === "reader") {
    const v = routeInfo.edition, n = routeInfo.n;
    if (!catalog) return; // wait for catalog
    const entry = catalog[v]?.find((c) => c.number === n);
    if (!entry) {
      toast("This chapter does not exist.");
      location.href = "/";
      return;
    }
    choose(v);
    current = entry;
    currentEdition = v;
    $("#home").hidden = true;
    $("#chapter-index").hidden = true;
    $("#reader").hidden = false;
    const idx = catalog[v].indexOf(entry);
    const prevBtn = $("#prev");
    const nextBtn = $("#next");
    if (prevBtn) {
      if (idx === 0) {
        prevBtn.setAttribute("disabled", "");
        prevBtn.removeAttribute("href");
        prevBtn.classList.add("disabled");
        prevBtn.onclick = (e) => e.preventDefault();
      } else {
        prevBtn.removeAttribute("disabled");
        prevBtn.classList.remove("disabled");
        prevBtn.setAttribute("href", `/${v}/chapter-${catalog[v][idx - 1].number}`);
        prevBtn.onclick = (e) => { e.preventDefault(); navigate(-1); };
      }
    }
    if (nextBtn) {
      if (idx === catalog[v].length - 1) {
        nextBtn.setAttribute("disabled", "");
        nextBtn.removeAttribute("href");
        nextBtn.classList.add("disabled");
        nextBtn.onclick = (e) => e.preventDefault();
      } else {
        nextBtn.removeAttribute("disabled");
        nextBtn.classList.remove("disabled");
        nextBtn.setAttribute("href", `/${v}/chapter-${catalog[v][idx + 1].number}`);
        nextBtn.onclick = (e) => { e.preventDefault(); navigate(1); };
      }
    }
    mark();
    restoring = true;

    // Check for prerendered content
    const chapterEl = $("#chapter");
    const prerendered = chapterEl.dataset.prerendered;
    if (prerendered === `${v}/${n}`) {
      // Content already in DOM — no fetch, no title override
      afterChapterLoaded(v, n, entry, idx);
      return;
    }

    chapterEl.textContent = "Opening chapter…";
    $("#edition-label").textContent =
      `${v === "first" ? "First Edition" : "Revised"} / ${n} of ${catalog[v].length}`;

    try {
      const res = await fetch(entry.path);
      if (!res.ok) throw Error();
      const data = await res.json();
      if (id !== loadId) return;
      chapterEl.innerHTML = data.html;
      document.title = data.title + " — " + v + " · TWATF";
      afterChapterLoaded(v, n, entry, idx);
    } catch {
      restoring = false;
      chapterEl.textContent =
        "This chapter could not load. Check your connection and reload the page.";
    }
    return;
  }

  // Home
  current = null;
  currentEdition = null;
  $("#home").hidden = false;
  $("#chapter-index").hidden = true;
  $("#reader").hidden = true;
  choose(version);
  document.title = "The World After the Fall — Reader";
  scrollTo(0, 0);
}

function navigate(delta) {
  storePosition();
  const a = catalog[version],
    i = a.findIndex((c) => c.number === current.number),
    c = a[i + delta];
  if (c) location.href = `/${version}/chapter-${c.number}`;
}

// Wire up static DOM
const startEl = $("#start");
if (startEl) {
  if (startEl.tagName === "A") {
    startEl.addEventListener("click", () => storePosition());
  } else {
    startEl.onclick = goIndex;
  }
}
$("#resume-first")?.addEventListener("click", () => storePosition());
$("#resume-revised")?.addEventListener("click", () => storePosition());
document
  .querySelectorAll("[data-version]")
  .forEach((b) => (b.onclick = () => choose(b.dataset.version)));
$("#chapter-list").onclick = () => openList();
$("#bookmarks").onclick = () => openList(true);
$("#back").onclick = () => {
  storePosition();
  location.href = "/";
};
$(".brand").href = "/";
$(".brand").onclick = storePosition;
$("#settings").onclick = () => $("#preferences").showModal();
const settingsReset = $("#settings-reset");
if (settingsReset) {
  settingsReset.onclick = () => {
    state.theme = "oled";
    state.font = "serif";
    state.size = 20;
    settings();
    save();
  };
}
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $("#" + b.dataset.close).close()));
["preferences", "contents", "support"].forEach((id) => {
  const dlg = $("#" + id);
  if (dlg) {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
  }
});
$("#search").oninput = list;
$("#list-version").onchange = () => {
  list();
  $("#chapter-results").scrollTop = 0;
};
$("#bookmark").onclick = () => {
  const key = version + ":" + current.number;
  state.bookmarks = state.bookmarks.includes(key)
    ? state.bookmarks.filter((x) => x !== key)
    : [...state.bookmarks, key];
  save();
  mark();
};
["theme", "font"].forEach(
  (k) =>
    ($("#" + k).oninput = (e) => {
      state[k] = k === "size" ? Number(e.target.value) : e.target.value;
      settings();
      save();
    }),
);
$("#contents").addEventListener("close", () =>
  document.body.classList.remove("chapter-popup-open"),
);

let timer;
addEventListener(
  "scroll",
  () => {
    clearTimeout(timer);
    timer = setTimeout(storePosition, 150);
  },
  { passive: true },
);
addEventListener("pagehide", storePosition);
addEventListener("keydown", (e) => {
  if (
    !current ||
    document.querySelector("dialog[open]") ||
    /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
  )
    return;
  if (e.key === "ArrowRight") navigate(1);
  if (e.key === "ArrowLeft") navigate(-1);
});
$("#index-search").oninput = indexRender;
$("#index-sort").onclick = () => {
  reverseIndex = !reverseIndex;
  $("#index-sort").setAttribute(
    "aria-label",
    reverseIndex ? "Sort chapters ascending" : "Sort chapters descending",
  );
  indexRender();
};
$("#index-version").onchange = (e) => {
  choose(e.target.value);
  location.href = `/${version}`;
};
settings();
choose(version);
fetch("data/catalog.json")
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then((c) => {
    catalog = c;
    route();
  })
  .catch(() => {
    const startEl2 = $("#start");
    if (startEl2) startEl2.disabled = true;
    const resumeNote = $("#resume-note");
    if (resumeNote)
      resumeNote.textContent =
        "Unable to load the library. Please reload when your connection returns.";
  });

function resizeText(delta) {
  state.size = Math.max(16, Math.min(30, Number(state.size) + delta));
  settings();
  save();
}
$("#size-down").onclick = () => resizeText(-1);
$("#size-up").onclick = () => resizeText(1);


// ── Reader header: auto-hide on scroll-down, reveal on scroll-up / left-click ──
(function () {
  let lastY = 0,
    headerPinnedByClick = false,
    scrollTicking = false;

  function isInReader() {
    return !$("#reader").hidden;
  }
  function showHeader() {
    document.body.classList.remove("header-hidden");
  }
  function hideHeader() {
    document.body.classList.add("header-hidden");
  }

  // Scroll: hide going down, reveal going up
  addEventListener(
    "scroll",
    () => {
      if (!isInReader()) {
        showHeader();
        lastY = scrollY;
        return;
      }
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          const delta = scrollY - lastY;
          if (delta > 6 && !headerPinnedByClick) {
            hideHeader();
          } else if (delta < -6) {
            showHeader();
            headerPinnedByClick = false;
          }
          lastY = scrollY;
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    },
    { passive: true },
  );

  // Left-click in the reading area toggles header visibility
  document.addEventListener("click", (e) => {
    if (!isInReader()) return;
    if (e.target.closest("header, dialog, .reader-nav, #comments, button, a, select, input"))
      return;
    if (document.body.classList.contains("header-hidden")) {
      showHeader();
      headerPinnedByClick = true;
    } else {
      hideHeader();
      headerPinnedByClick = false;
    }
  });
})();
}
