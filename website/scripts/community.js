const DISCORD_SERVERS = [
  {
    key: "workshop",
    name: "The Workshop",
    role: "Official Server",
    icon: "workshop.png",
    className: "discord-server-workshop",
    description: "A united community of different web novel readers.",
    recommended: true,
  },
  {
    key: "meaowland",
    name: "Meaowland",
    role: "Official Server",
    icon: "meaowland.png",
    className: "discord-server-meaowland",
    description:
      "Official server of MrMeaow46, one of the developers of the site.",
    recommended: true,
  },
  {
    key: "twatf",
    name: "The World After The Fall",
    role: "Fan Server",
    icon: "twatf.png",
    className: "discord-server-twatf",
    description: "A community for readers and fans of TWATF.",
  },
  {
    key: "wiki",
    name: "The World After the Fall | Wiki Fandom",
    role: "Fan Server",
    icon: "wiki.png",
    className: "discord-server-wiki",
    description: "A fan community for documenting the world and its characters.",
  },
];

const DISCORD_URLS = {
  meaowland: "https://discord.gg/a3cQ8atwQH",
  twatf: "https://discord.gg/HupWTFzvw8",
  wiki: "https://discord.gg/nKEE84vXzS",
};

function renderDiscordServer(server) {
  const unavailable = server.key === "twatf" || server.key === "wiki";
  const action = unavailable ? "Invite unavailable" : "Join server ↗";
  const linkAttributes = unavailable
    ? `class="discord-server-link is-unavailable" data-server="${server.key}"`
    : `class="discord-server-link" data-server="${server.key}" target="_blank" rel="noopener noreferrer"`;
  const recommendation = server.recommended
    ? '<span class="discord-recommended">Recommended to join</span>'
    : "";

  return `
    <article class="identity-card developer-profile discord-server-profile ${server.className}" aria-label="${server.name}">
      <div class="identity-art"></div>
      <div class="identity-copy">
        <span class="identity-icon"><img src="/assets/servers/${server.icon}" alt="${server.name} server icon" /></span>
        <div class="developer-name"><h2>${server.name}</h2><span class="developer-role">${server.role}</span></div>
        <nav class="developer-links" aria-label="${server.name} server">
          <a ${linkAttributes}>${action}</a>
        </nav>
        <p class="developer-bio">${server.description}</p>
        ${recommendation}
      </div>
    </article>`;
}

function openDiscordServers() {
  let dialog = document.getElementById("discord-servers");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "discord-servers";
    dialog.className = "discord-servers-dialog";
    dialog.setAttribute("aria-labelledby", "discord-servers-title");
    dialog.innerHTML = `
      <div class="discord-servers-shell">
        <button type="button" class="discord-servers-close btn-close" aria-label="Close Discord servers">✕</button>
        <div class="info-heading">
          <h1 id="discord-servers-title">Discord Servers</h1>
          <p>Find the official and fan communities of The World After the Fall.</p>
        </div>
        <div class="discord-server-profiles">
          <h2>Support / Official Server</h2>
          <div class="discord-server-list">
            ${DISCORD_SERVERS.slice(0, 2).map(renderDiscordServer).join("")}
          </div>
          <h2>Fan Servers of TWATF</h2>
          <div class="discord-server-list">
            ${DISCORD_SERVERS.slice(2).map(renderDiscordServer).join("")}
          </div>
        </div>
      </div>`;
    document.body.append(dialog);
    dialog
      .querySelector(".discord-servers-close")
      .addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    const config = window.READER_CONFIG || {};
    const urls = { ...DISCORD_URLS, workshop: config.discordUrl };
    dialog.querySelectorAll(".discord-server-link").forEach((link) => {
      const url = urls[link.dataset.server];
      if (typeof url === "string" && /^https:\/\//i.test(url)) {
        link.href = url;
      } else {
        link.classList.add("is-unavailable");
        link.addEventListener("click", (event) => event.preventDefault());
      }
    });
  }
  dialog.showModal();
}

document.querySelectorAll('[data-community="discordUrl"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openDiscordServers();
  });
});

document
  .querySelectorAll('[data-community]:not([data-community="discordUrl"])')
  .forEach((link) => {
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
