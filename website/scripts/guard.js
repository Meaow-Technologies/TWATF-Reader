// Developer-tools key shortcuts are blocked as a light deterrent;
// right-click context menu is intentionally left enabled.
addEventListener(
  "keydown",
  (event) => {
    const key = event.key.toLowerCase();
    const inspect =
      key === "f12" ||
      (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
      (event.metaKey && event.altKey && ["i", "j", "c"].includes(key)) ||
      ((event.ctrlKey || event.metaKey) && key === "u");
    if (inspect) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
