/* Independent background controls inspired by Bonjourr's customization options. */
(() => {
  const KEY = "twatf-background-v1";
  const defaults = {
    source: "default",
    color: "#101411",
    url: "",
    blur: 0,
    brightness: 70,
    zoom: 100,
    x: 50,
    y: 50,
    panels: 97,
  };
  const bounds = {
    blur: [0, 20],
    brightness: [15, 120],
    zoom: [100, 180],
    x: [0, 100],
    y: [0, 100],
    panels: [60, 100],
  };
  function normalize(raw) {
    const s = { ...defaults };
    if (!raw || typeof raw !== "object") return s;
    for (const k in bounds) {
      const n = Number(raw[k]);
      if (Number.isFinite(n))
        s[k] = Math.max(bounds[k][0], Math.min(bounds[k][1], n));
    }
    if (raw && raw.blur === 1 && !raw._customBlur) {
      s.blur = 0;
    }
    if (["default", "artwork2", "custom", "url", "color"].includes(raw.source))
      s.source = raw.source;
    if (/^#[0-9a-f]{6}$/i.test(raw.color || "")) s.color = raw.color;
    if (typeof raw.url === "string" && raw.url.startsWith("https://"))
      s.url = raw.url;
    return s;
  }
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  let state = normalize(saved),
    customURL = "",
    remoteURL = "",
    epoch = 0;
  const root = document.documentElement;
  const dialog = document.createElement("dialog");
  dialog.id = "background-settings";
  dialog.setAttribute("aria-labelledby", "background-title");
  dialog.innerHTML = `<div class="dialog-head settings-head">
    <h2 id="background-title" class="settings-title">
      <svg class="settings-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>Customize Background</span>
    </h2>
    <div class="settings-actions">
      <button id="background-reset" type="button" class="btn-reset" title="Reset background to default">Reset</button>
      <button id="background-close" class="btn-close" aria-label="Close background settings">✕</button>
    </div>
  </div>
  <div class="settings-body">
    <div class="background-preview-section">
      <div class="background-preview" aria-label="Background preview">
        <div class="background-preview-art"></div>
        <span>Find your atmosphere.</span>
      </div>
    </div>

    <div class="background-section">
      <h3 class="settings-section-title">Wallpaper Source</h3>
      <div class="settings-field">
        <label for="background-source" class="settings-label">Image or Style</label>
        <select id="background-source" class="settings-select">
          <option value="default">The World After the Fall Artwork 1</option>
          <option value="artwork2">The World After the Fall Artwork 2</option>
          <option value="custom">Your own image</option>
          <option value="url">Image URL</option>
          <option value="color">Solid colour</option>
        </select>
      </div>

      <div id="background-upload-panel" class="background-subpanel" hidden>
        <label for="background-file" class="settings-label">Choose an image</label>
        <input id="background-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="settings-file-input">
        <p class="muted settings-help-text">JPG, PNG, WebP or GIF · up to 10 MB. Stored on this device only.</p>
        <button id="background-remove" type="button" class="btn-danger-subtle">Remove uploaded image</button>
      </div>

      <div id="background-url-panel" class="background-subpanel" hidden>
        <label for="background-url" class="settings-label">HTTPS image URL</label>
        <div class="background-url-row">
          <input id="background-url" type="url" placeholder="https://example.com/image.jpg" class="settings-input">
          <button id="background-url-apply" type="button" class="settings-btn-apply">Apply</button>
        </div>
        <p class="muted settings-help-text">Images load directly from that website. Its host receives the image request.</p>
      </div>

      <div id="background-color-panel" class="background-subpanel" hidden>
        <label for="background-color" class="settings-label">Background colour</label>
        <div class="background-color-row">
          <input id="background-color" type="color" value="#101411" class="settings-color-input">
        </div>
      </div>
    </div>

    <div class="background-section">
      <h3 class="settings-section-title">Adjustments</h3>
      <div class="background-controls-grid">
        ${[
          ["brightness", "Brightness", "%", 15, 120, 1],
          ["blur", "Blur", "px", 0, 20, 0.5],
          ["zoom", "Zoom", "%", 100, 180, 1],
          ["x", "Horizontal", "%", 0, 100, 1],
          ["y", "Vertical", "%", 0, 100, 1],
          ["panels", "Panel opacity", "%", 60, 100, 1],
        ]
          .map(
            ([k, label, unit, min, max, step]) =>
              `<div class="background-range-card">
                <div class="background-range-header">
                  <label for="background-${k}" class="settings-label">${label}</label>
                  <output id="background-${k}-value" class="range-val"></output>
                </div>
                <input id="background-${k}" type="range" class="settings-range" min="${min}" max="${max}" step="${step}" data-unit="${unit}">
              </div>`,
          )
          .join("")}
      </div>
    </div>

    <div class="background-footer">
      <p class="muted settings-footer-note" id="background-status" role="status">Changes save automatically on this device.</p>
      <button id="background-done" type="button" class="background-done-btn">Done</button>
    </div>
  </div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  function message(t) {
    $("#background-status").textContent = t;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      message("Saved on this device.");
    } catch {
      message(
        "Applied for this visit. Your browser could not save these settings.",
      );
    }
  }
  function apply() {
    let bgUrl = "/assets/images/background.webp";
    if (state.source === "color") {
      bgUrl = null;
    } else if (state.source === "artwork2") {
      bgUrl = "/assets/images/background_image-2.jpg";
    } else if (state.source === "custom" && customURL) {
      bgUrl = customURL;
    } else if (state.source === "url" && remoteURL) {
      bgUrl = remoteURL;
    }
    const image = bgUrl ? `url(${JSON.stringify(bgUrl)})` : "none";
    root.style.setProperty("--wallpaper", image);
    root.style.setProperty("--wallpaper-color", state.color);
    root.style.setProperty("--wallpaper-blur", state.blur + "px");
    root.style.setProperty("--wallpaper-brightness", state.brightness / 100);
    root.style.setProperty("--wallpaper-zoom", state.zoom / 100);
    root.style.setProperty("--wallpaper-position", `${state.x}% ${state.y}%`);
    root.style.setProperty("--reading-opacity", state.panels + "%");
    $("#background-source").value = state.source;
    $("#background-color").value = state.color;
    for (const k in bounds) {
      $("#background-" + k).value = state[k];
      $("#background-" + k + "-value").textContent =
        state[k] + ($("#background-" + k).dataset.unit === "px" ? " px" : "%");
      $("#background-" + k).disabled =
        state.source === "color" && ["blur", "zoom", "x", "y"].includes(k);
    }
    $("#background-upload-panel").hidden = state.source !== "custom";
    $("#background-url-panel").hidden = state.source !== "url";
    $("#background-color-panel").hidden = state.source !== "color";
    $("#background-remove").disabled = !customURL;
  }
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("twatf-background", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("images");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function imageStore(action, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        "images",
        action === "get" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("images");
      const request =
        action === "get"
          ? store.get("custom")
          : action === "put"
            ? store.put(value, "custom")
            : store.delete("custom");
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timeout = setTimeout(() => {
        img.src = "";
        reject(Error("Image timed out"));
      }, 15000);
      img.referrerPolicy = "no-referrer";
      img.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(Error("Image cannot be loaded"));
      };
      img.src = url;
    });
  }
  async function loadRemote(url) {
    const id = ++epoch;
    message("Loading image…");
    try {
      await loadImage(url);
      if (id !== epoch) return;
      remoteURL = url;
      state.url = url;
      state.source = "url";
      apply();
      save();
    } catch {
      if (id === epoch)
        message(
          "Could not load that image. Use a direct HTTPS image link; your current background is unchanged.",
        );
    }
  }
  $("#background-source").onchange = () => {
    ++epoch;
    state.source = $("#background-source").value;
    apply();
    save();
    if (state.source === "url" && state.url) loadRemote(state.url);
    if (state.source === "custom" && !customURL)
      message(
        "Choose an image below. The default artwork stays visible until then.",
      );
  };
  for (const k in bounds)
    $("#background-" + k).oninput = (e) => {
      state[k] = Number(e.target.value);
      if (k === "blur") state._customBlur = true;
      apply();
      save();
    };
  $("#background-color").oninput = (e) => {
    state.color = e.target.value;
    apply();
    save();
  };
  $("#background-url-apply").onclick = () => {
    const url = $("#background-url").value.trim();
    try {
      if (new URL(url).protocol !== "https:") throw Error();
      loadRemote(url);
    } catch {
      message("Enter a valid HTTPS image URL.");
    }
  };
  $("#background-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > 10 * 1024 * 1024
    ) {
      message("Choose a JPG, PNG, WebP or GIF image smaller than 10 MB.");
      e.target.value = "";
      return;
    }
    const id = ++epoch,
      url = URL.createObjectURL(file);
    message("Loading image…");
    try {
      await loadImage(url);
      if (id !== epoch) {
        URL.revokeObjectURL(url);
        return;
      }
      await imageStore("put", file);
      if (id !== epoch) {
        URL.revokeObjectURL(url);
        return;
      }
      if (customURL) URL.revokeObjectURL(customURL);
      customURL = url;
      state.source = "custom";
      apply();
      save();
    } catch {
      URL.revokeObjectURL(url);
      message(
        "Could not load or save that image. Try another image or allow browser storage.",
      );
    }
    e.target.value = "";
  };
  $("#background-remove").onclick = async () => {
    ++epoch;
    try {
      await imageStore("delete");
      if (customURL) URL.revokeObjectURL(customURL);
      customURL = "";
      state.source = "default";
      apply();
      save();
    } catch {
      message("Could not remove the saved image. Please try again.");
    }
  };
  $("#background-reset").onclick = () => {
    ++epoch;
    state = { ...defaults };
    delete state._customBlur;
    remoteURL = "";
    $("#background-url").value = "";
    apply();
    save();
    message(
      customURL
        ? "Default background restored. Your uploaded image is still available under “Your own image”."
        : "Default background restored.",
    );
  };
  function close() {
    dialog.close();
  }
  $("#background-close").onclick = $("#background-done").onclick = close;
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  document.querySelectorAll(".background-open").forEach(
    (button) =>
      (button.onclick = () => {
        const preferences = document.querySelector("#preferences");
        if (preferences?.open) preferences.close();
        $("#background-url").value = state.url;
        dialog.showModal();
        dialog.scrollTop = 0;
      }),
  );
  apply();
  imageStore("get")
    .then((blob) => {
      if (blob) {
        customURL = URL.createObjectURL(blob);
        apply();
      } else if (state.source === "custom")
        message(
          "Your saved image is no longer available. Choose another image.",
        );
    })
    .catch(() => {
      if (state.source === "custom")
        message("Image storage is unavailable. The default artwork is shown.");
    });
  if (state.source === "url" && state.url) loadRemote(state.url);
})();
