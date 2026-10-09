// One place to edit the site's name, links and comment settings.
// Replace every value that contains YOUR- before going live.

export const SITE = {
  name: "The World After The Fall",
  short: "TWATF",
  url: "https://YOUR-PROJECT.pages.dev",
  repo: "YOUR-USERNAME/YOUR-REPO",
  discord: "https://discord.gg/YOUR-INVITE",
  email: "YOUR-EMAIL@example.com",
  metaDescription:
    "From the author of Omniscient Reader's Viewpoint. One day, a tower appeared in the skies of all the major cities…",
  // Each line is shown as its own paragraph on the homepage and book pages.
  description: [
    "From the author of Omniscient Reader's Viewpoint.",
    "One day, a tower appeared in the skies of all the major cities…",
    "Humans were suddenly summoned to become “Walkers”, and they needed to clear the tower to save the world.",
    "Floor 77:",
    "The “Stone of Regression” was discovered. Walkers could now “return” to the past. Slowly… everyone left.",
    "Humanity’s last hope, “Carpe Diem”, was formed, joined by people who refused to abandon the world.",
    "The last Walker reached floor 100. He no longer knew what to believe.",
  ],
} as const;

// The two versions shown as cards on the Read page.
// The ids must match the folder names in /chapters and "metaBook" in each 0000.md.
export const BOOKS = {
  original: { id: "original", title: "TWATF (original)", label: "Original", author: "AUTHOR NAME" },
  revised: { id: "revised", title: "TWATF (revised)", label: "Revised", author: "AUTHOR NAME" },
} as const;

// Shown on the /donate page. Delete any entry you don't use.
export const DONATE = {
  link: "https://YOUR-DONATION-LINK",
  discordHandle: "@YOUR-DISCORD-HANDLE",
  crypto: [
    { label: "Bitcoin (BTC)", address: "YOUR-BTC-ADDRESS" },
    { label: "Ethereum (ETH)", address: "YOUR-ETH-ADDRESS" },
  ],
} as const;

// Giscus (chapter comments). Get these values from https://giscus.app after
// enabling Discussions on your repo. One discussion category per book.
export const COMMENTS = {
  repoId: "YOUR-GISCUS-REPO-ID",
  categories: {
    original: { name: "original", id: "YOUR-CATEGORY-ID-ORIGINAL" },
    revised: { name: "revised", id: "YOUR-CATEGORY-ID-REVISED" },
  },
} as const;
