# TWATF-Reader

**TWATF-Reader** is a fan project hosting unofficial fan translations of the webnovel ***The World After The Fall***.

🌐 Site: https://YOUR-PROJECT.pages.dev  
📥 EPUB downloads: https://YOUR-PROJECT.pages.dev/download  
💬 Discord: https://discord.gg/YOUR-INVITE

> Replace every value containing `YOUR-` (see [Placeholders](#placeholders)) before going live.

---

## Features

- Two versions of the story: **original** and **revised**, each with its own chapter list.
- Reader settings: themes, font, font size, line height and more.
- EPUB downloads for offline reading.
- Chapter comments through GitHub Discussions (Giscus).
- No trackers or ads.

---

## How the project is organised

```
chapters/original/    chapter files (0000.md is the EPUB master, 0001.md, 0002.md, ...)
chapters/revised/     the same for the revised version
images/               chapter images and book covers (original/, revised/)
scripts/              build_web.py (chapters -> site pages), build_epub.py, image tools
website/              the SvelteKit site (src/, static/)
```

Each chapter file starts with a small header (`title`, `slug`, `index`, ...). Copy one of the placeholder chapters to see the format.

---

## Run it locally

You need Node.js 20 or newer, Python 3, and [Pandoc](https://pandoc.org/installing.html).

```bash
python -m venv .venv
source .venv/bin/activate
pip install python-frontmatter imagesize
mkdir -p website/static/assets/images
cp -r images/* website/static/assets/images/
python scripts/build_web.py
cd website
npm ci
npm run dev
```

Building the EPUBs locally (`scripts/images_epub.py`, then `scripts/build_epub.py`) also needs ImageMagick (the `magick` command).

Run `python scripts/build_web.py` again whenever you change a chapter. To build the final site, run `npm run build` in `website/`; the result is in `website/build/`.

---

## Placeholders

| Where | What to replace |
|---|---|
| `website/src/lib/site.ts` | project URL, GitHub repo, Discord invite, email, donation link and addresses, author name, Giscus ids |
| `.github/workflows/deploy-website.yml` | `YOUR-CLOUDFLARE-PROJECT` (and add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets) |
| `.github/FUNDING.yml`, `giscus.json` | project URL |
| `scripts/build_epub.py` | `YOUR-USERNAME/YOUR-REPO` and the Discord invite in the footer links |
| `website/src/lib/assets/` | the placeholder background and cover images |
| `images/original/cover.webp`, `images/revised/cover.webp` | EPUB covers |
| `chapters/` | the placeholder chapters and the foreword/credits in each `0000.md` |

---

## Contributing

See the [Contribution Guide](contributing.md).

---

## Credits and legal

The website code is based on [LOTM-Reader](https://github.com/Bittu5134/LOTM-Reader) by Bittu5134, used and adapted here with the author's permission. See [license.md](license.md) for the code license, art credits and the legal disclaimer.

**We do not own the rights to the original novel.** All translations on this site are fan translations. Please support the author by buying the official releases where available.
