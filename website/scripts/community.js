document.querySelectorAll("[data-community]").forEach((link) => {
  const url = (window.READER_CONFIG || {})[link.dataset.community];
  if (typeof url === "string" && /^https:\/\//i.test(url)) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = link.getAttribute("aria-label");
  } else {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      let notice = document.getElementById("community-notice");
      if (!notice) {
        notice = document.createElement("div");
        notice.id = "community-notice";
        notice.setAttribute("role", "status");
        document.body.append(notice);
      }
      notice.textContent =
        link.getAttribute("aria-label") + " link coming soon.";
      notice.hidden = false;
      clearTimeout(notice.hideTimer);
      notice.hideTimer = setTimeout(() => (notice.hidden = true), 3000);
    });
  }
});
