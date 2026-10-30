# AGENTS.md

Repository guidance and technical context for AI agents and contributors working
on the TWATF Reader.

## Project summary

This repository contains a fan-made static reader for *The World After the
Fall* by SingNShong. It publishes two editions:

- First Edition: 247 chapters.
- Revised Edition: 267 chapters.

The public site is `https://twatf.pages.dev`. The project is designed for
Cloudflare Pages Git integration: a Python build generates the static site and
EPUB files, Cloudflare deploys `dist/`, and Cloudflare Pages Functions under
`functions/` provide server-side behavior including Discord OAuth authentication,
a native comment and reaction system backed by Cloudflare D1, and legacy webhook
relays.

The reader reading progress, bookmarks, theme, font, and text size are stored
in each visitor's browser. Chapter comments, replies, and reactions use Discord
OAuth authentication and persist in Cloudflare D1.

## Source of truth and generated output

Edit source files only. Do not manually edit generated files in `dist/`.

| Path | Purpose |
| --- | --- |
| `website/` | Static HTML, CSS, browser JavaScript, assets, headers, robots rules, and Giscus theme files. |
| `chapters/first/` | First Edition source XHTML chapters. |
| `chapters/revised/` | Revised Edition source XHTML chapters. |
| `scripts/build.py` | Validates chapter XHTML and generates `dist/`, chapter JSON, chapter pages, metadata, sitemap, and EPUBs. |
| `scripts/preview.py` | Local static preview server for `dist/` on port 8765. It does not execute Pages Functions. |
| `scripts/migrate_giscus.mjs` | Migrates legacy GitHub Discussions (Giscus) to Cloudflare D1 SQL. |
| `functions/` | Cloudflare Pages Functions: Discord OAuth, comments API, chapter reactions, middleware, and webhooks. |
| `functions/schema.sql` | D1 database schema for users, sessions, comments, and chapter reactions. |
| `tests/test_build.py` | Python regression tests for build propagation, validation, generated pages, metadata, and EPUB consistency. |
| `dist/` | Generated deployment artifact. It is recreated by the build and should not be hand-edited. |
| `.github/workflows/build.yml` | CI-only test/build workflow. Cloudflare Git integration performs production deployment. |
| `.github/workflows/migrate-comments.yml` | Manual GitHub Actions workflow to export Giscus discussions and apply them to D1. |

If a generated page does not reflect an HTML change, inspect
`generate_chapter_pages()` in `scripts/build.py`: chapter pages are generated
from a base HTML document and several elements are replaced with regular
expressions during the build.

## Build and test commands

Run from the repository root:

```sh
npm test
npm run build
npm run preview
```

Equivalent direct commands:

```sh
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 scripts/preview.py
```

The preview server is available at:

```text
http://localhost:8765/
```

It mimics Cloudflare Pages static routing (`/first` maps to
`first.html`, `/first/chapter-1` maps to the generated chapter page), but it
does not run `functions/_middleware.js` or
`functions/github-discussion-webhook.js`. Test deployed Functions against the
real HTTPS hostname.

After code changes, the minimum validation is:

1. `npm test`
2. `node --check` for changed JavaScript files.
3. `git diff --check`.

For build or chapter-generation changes, run `python3 scripts/build.py` and
inspect the relevant generated files in `dist/`.

## Build pipeline

`scripts/build.py` performs the following:

1. Reads every `*.xhtml` file under both edition directories.
2. Requires filenames with at least four digits, valid XHTML, a title, a body,
   supported tags, no attributes on chapter elements, non-empty text, and
   contiguous chapter numbers starting at 1.
3. Extracts chapter title, HTML fragment, word count, and source SHA-256.
4. Copies `website/` to a temporary output directory.
5. Writes `data/<edition>/<number>.json` and `data/catalog.json`.
6. Builds and verifies one EPUB 3 file per edition.
7. Replaces chapter-card placeholders in `index.html` and `chapters.html`.
8. Generates static chapter pages under:
   - `dist/first/chapter-N.html`
   - `dist/revised/chapter-N.html`
9. Generates edition pages, SEO metadata, canonical URLs, sitemap, robots
   rules, and `build-manifest.json`.
10. Adds content hashes to static asset URLs where appropriate.
11. Atomically replaces the previous `dist/` only after validation succeeds.

The build is intentionally source-driven: a chapter correction propagates to
both the browser JSON/static page and the matching EPUB.

## HTML/page architecture

There are two main base documents:

- `website/index.html`: homepage plus shared reader markup.
- `website/chapters.html`: chapter-index page plus shared reader markup.

The build uses these base documents to produce static chapter and edition
pages. Shared reader markup includes:

- `#reader`: active chapter reader.
- `#chapter`: chapter HTML content.
- `#edition-label`: current edition and chapter count.
- `#prev`, `#chapter-list`, `#next`: bottom navigation controls.
- `.reader-prev`, `.reader-chapter-list`, `.reader-next`: duplicated top
  navigation controls.
- `#contents`: Chapters/Bookmarks dialog.
- `#comments`: Chapter discussion section containing:
  - `.comments-rules-notice`: Community spoiler and etiquette notice.
  - `#chapter-reactions`: Centered emoji reaction bar for the chapter.
  - `#native-comments`: Discord-authenticated comments list and reply forms.
  - `#legacy-comments`: Collapsible archive viewer for legacy GitHub Discussions.
- `#preferences`: Settings dialog.

The generated chapter page contains a top navigation row before the metadata
row, then the metadata row (`Home`, edition label, `Bookmark`), chapter body,
bottom navigation, and comments.

The top and bottom navigation controls intentionally use shared classes rather
than duplicate IDs. `website/scripts/app.js` synchronizes both sets when it
loads a chapter, including first/last chapter disabled states and navigation
URLs. The chapter generator preserves the top navigation with
`reader-nav-top`; changes to this structure must also account for the
replacement logic in `scripts/build.py`.

## Browser runtime

`website/scripts/app.js` is the main client controller. It:

- Derives the route from the pathname:
  - `/` -> homepage
  - `/first` and `/revised` -> edition index
  - `/first/chapter-N` and `/revised/chapter-N` -> reader
  - `/chapters` -> index fallback using saved edition
- Loads `data/catalog.json`.
- Loads chapter JSON when needed, while generated chapter pages may already
  contain prerendered content.
- Stores state in localStorage key `twatf-reader`.
- Tracks edition-specific progress ratios and bookmarks.
- Applies theme, font, and text-size settings through CSS variables.
- Opens Settings, Background, Chapters, Bookmarks, and support dialogs.
- Maintains the duplicated chapter navigation.
- Scrolls to the chapter discussion section from the Comments button.

Important state defaults currently include:

```text
version: revised
theme: oled
size: 20
font: bookerly
```

Do not introduce a second state store or route system without updating the
existing pathname/hash behavior. Earlier versions used hash routes such as
`#read/first/1`; current canonical routes are pathname-based.

## CSS architecture

`website/styles/style.css` is the stylesheet entry point. Its import order is
significant:

1. `base.css`
2. `home.css`
3. `dialogs.css`
4. `themes-responsive.css`
5. `chapters.css`
6. `home-overrides.css`
7. `navigation.css`
8. `wallpaper-background.css`
9. `info.css`
10. `settings.css`

Keep related rules in the existing file and preserve import order unless there
is a specific cascade reason to change it. Several earlier regressions were
caused by broad overflow, sticky-position, or dialog rules overriding another
page's layout.

Important layout areas:

- `home.css`: reader layout, reader metadata, top/bottom navigation, article
  typography, general home content.
- `chapters.css`: chapter index two-panel layout, sticky left panel, index
  toolbar and cards.
- `settings.css`: Settings, Background, Chapters, and Bookmarks dialog styling.
- `navigation.css`: header behavior, comments section, chapter list dialog
  legacy/layout rules.
- `dialogs.css`: generic dialog defaults and fallback controls.
- `wallpaper-background.css`: background customizer and wallpaper behavior.
- `info.css`: info page, developer cards, Discord server popup, and related
  cards.

The Settings, Background, Chapters, and Bookmarks dialogs intentionally share
the polished settings surface: rounded panel, backdrop blur, layered shadow,
accent header, focus glow, and mobile bottom-sheet behavior. The Chapters and
Bookmarks views both use `#contents`; `app.js` changes the title/icon and adds
the `bookmarks-dialog` class for bookmark mode.

When changing mobile layout, test both:

- Settings/Background/Contents dialogs with scrolling.
- Chapter index sticky left panel and right chapter list.

Avoid global `overflow: hidden` or viewport changes unless they are scoped to
the affected dialog/page state.

## Fonts and assets

Fonts are bundled under `website/assets/fonts/` and registered with
`@font-face` in `website/styles/base.css`. The default reader font is Bookerly.
Available configured font keys include Bookerly, Libre Baskerville, Literata,
OpenDyslexic, Roboto, Georgia/serif, Palatino, Times New Roman, sans-serif,
Arial, Verdana, and monospace.

Server/community assets are under `website/assets/servers/` and profile assets
under `website/assets/profiles/`. General images are under
`website/assets/images/`.

The Discord webhook avatar is currently configured as:

```text
https://twatf.pages.dev/assets/images/jaehwan.png
```

That URL only works after the image is committed and deployed.

## Community and Discord UI

`website/scripts/community.js` dynamically creates the Discord server dialog.
It contains official servers (The Workshop and Meaowland) and fan servers
(The World After The Fall and Wiki Fandom), with metadata, links, icons, and
banner styling in `website/styles/info.css`.

Use the existing info-page developer-card visual language for new community
cards. Keep external links validated as HTTPS and opened with
`noopener noreferrer`.

Profile markup is primarily in `website/info.html`, profile behavior is
handled alongside community behavior in `website/scripts/community.js`, and
profile styling is in `website/styles/info.css`.

## Native comments and Discord authentication

The reader features a native comment and reaction system powered by Cloudflare
Pages Functions and Cloudflare D1, styled compactly after the GSGW-Reader UI.

### Architecture and endpoints

- **Authentication**: Discord OAuth2 flow.
  - `GET /api/auth/discord`: Initiates Discord OAuth authorization, generating
    a cryptographically random state signed with HMAC-SHA256, stored in a
    temporary `twatf_oauth_state` cookie (`HttpOnly; Secure; SameSite=Lax; Max-Age=600`).
  - `GET /api/auth/discord/callback`: Verifies state, exchanges the authorization
    code for Discord tokens, retrieves user info (`/users/@me`), upserts the
    user into D1 `users`, generates a signed 30-day session token, saves it in
    D1 `sessions`, sets the `twatf_session` cookie (`HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`),
    and redirects the user back to the chapter.
  - `POST /api/auth/logout`: Clears the session from D1 and deletes the
    `twatf_session` cookie.
  - `GET /api/me`: Returns current user session state (`{ authenticated: true, user: {...} }`
    or `{ authenticated: false }`).
- **Comments and reactions API**:
  - `GET /api/comments?chapterId=<id>`: Retrieves comments and nested reply
    trees for the chapter with user avatars, roles, and reaction counts.
  - `POST /api/comments`: Submits a top-level comment or reply (requires
    authenticated session).
  - `POST /api/comments/:id/reactions/:emoji`: Toggles an emoji reaction on a
    comment.
  - `GET /api/chapter-reactions?chapterId=<id>`: Fetches aggregated emoji
    reaction counts and the current user's reaction for the chapter.
  - `POST /api/chapter-reactions`: Toggles the chapter-level emoji reaction.

### Database schema (`functions/schema.sql`)

Bound to Cloudflare Pages as `COMMENTS_DB` (Cloudflare D1 SQLite database):

- `users`: Discord user ID, username, discriminator, global name, avatar hash,
  and role (`user` or `admin`).
- `sessions`: Session ID, user ID, expiration timestamp, and client metadata.
- `comments`: Chapter ID, parent comment ID (for nested replies), user ID,
  comment body, edit timestamps, and soft-delete flag.
- `comment_reactions`: Comment ID, user ID, emoji, and timestamp.
- `chapter_reactions`: Chapter ID, user ID, emoji, and timestamp.

### Frontend styling and theme synchronization

The frontend UI is implemented in `website/scripts/comments.js` and styled in
`website/styles/navigation.css`:

- Compact 14px cards with avatar, author name, timestamp, reply button, and
  reaction counts.
- Smile-plus emoji reaction button with popover picker.
- Centered chapter reaction bar above the comments list.
- Notice banner informing users of spoiler etiquette and Discord rules.
- Real-time theme synchronization: a `MutationObserver` watches `data-theme`
  and `data-accent` on `document.documentElement` to adapt comment container
  surfaces, borders, and text colors to all reader themes (Light, Sepia, OLED,
  Nord, Dracula, Solarized, Mocha, Material You).

### Giscus to D1 migration

Legacy GitHub Discussions can be extracted into D1:

- `scripts/migrate_giscus.mjs`: Queries the GitHub GraphQL API for chapter
  discussions in `Meaow-Technologies/TWATF-Reader`, maps comments and authors
  into D1 schema, and generates SQL statements.
- `.github/workflows/migrate-comments.yml`: GitHub Actions workflow that runs
  the migration script and executes the SQL against D1 using `wrangler d1 execute`.
  Uses GitHub repository secret `GH_DISCUSSIONS_TOKEN` (custom secrets cannot
  start with `GITHUB_`).

## Legacy Giscus comments

Comments are provided by Giscus in a cross-origin iframe. Configuration is in
`website/scripts/config.js`, including repository/category IDs for First and
Revised editions. `website/scripts/comments.js`:

- Mounts Giscus after a chapter is loaded.
- Uses stable discussion keys such as
  `twatf-revised-chapter-12`.
- Stores a return path for Giscus authentication.
- Applies the configured local theme.
- Adds the profanity/slur warning behavior.
- Uses the theme URLs under `website/giscus/`.

The custom theme files are:

- `website/giscus/dark.css`
- `website/giscus/light.css`
- `website/giscus/admin.css`

The theme files import the official Giscus theme and then `admin.css`. The
owner badge rule is intended to change the GitHub `Member` association badge
to `Owner` only for:

- `https://github.com/MrMeaow46`
- `https://github.com/KleinDokja23`

The theme link is `crossorigin="anonymous"`, so `/giscus/*` must send
`Access-Control-Allow-Origin`, set in `functions/_middleware.js` and
`website/_headers`. When changing any file in `website/giscus/`, bump the
`owners-vN` version in `comments.js` and in both `@import` lines.

Giscus markup and caching can change. If owner styling stops applying, inspect
the actual Giscus DOM/classes and the deployed theme URL before changing the
selector. `comments.js` includes a theme cache-buster (`owners-v3`) so deployed
theme updates are fetched by the iframe.

The browser cannot reliably read submitted Giscus comment bodies because the
iframe is cross-origin. Do not implement Discord comment notifications by
trying to scrape iframe messages from the browser.

## Discord comment webhook integration

`functions/github-discussion-webhook.js` handles GitHub `discussion_comment`
webhooks. It:

- Verifies `X-Hub-Signature-256` with Web Crypto HMAC-SHA256.
- Accepts only `created` comments from
  `Meaow-Technologies/TWATF-Reader`.
- Posts a Discord embed containing the commenter's avatar, linked username,
  discussion title/link, comment body, timestamp, and Jaehwan webhook avatar.

Required Cloudflare Pages production environment variables and bindings:

```text
COMMENTS_DB                (D1 database binding to 'twatf-comments')
DISCORD_CLIENT_ID          (Discord OAuth Application Client ID)
DISCORD_CLIENT_SECRET      (Discord OAuth Application Client Secret)
SESSION_SECRET             (32+ character secret for HMAC signing session tokens)
GITHUB_WEBHOOK_SECRET      (Secret for verifying GitHub discussion webhooks)
DISCORD_GISCUS_WEBHOOK_URL (Discord webhook URL for comment alerts)
```

The GitHub repository webhook should target:

```text
https://twatf.pages.dev/github-discussion-webhook
```

Use `application/json`, enable SSL verification, subscribe only to
**Discussion comments**, and use the exact same random secret in GitHub and
Cloudflare. Never commit either secret.

The endpoint must be tested on the deployed HTTPS hostname. The local Python
preview server does not run Pages Functions and will return static responses.

## Anti-scraping and edge protection

`functions/_middleware.js` is Cloudflare Pages middleware. It:

- Adds security headers.
- Adds `X-Robots-Tag` controls for content endpoints.
- Rejects several recognizable automated extraction user agents on
  `/data/*` and `/assets/downloads/*`.
- Applies per-client request limits.
- Uses Cloudflare rate-limit bindings when available.
- Falls back to an in-memory per-isolate limiter when bindings are absent.

Recommended Cloudflare setup:

- `RATE_LIMITER` binding for general requests.
- Optional `CONTENT_RATE_LIMITER` binding with stricter thresholds for chapter
  JSON and EPUBs.
- Managed WAF rules.
- Bot Fight Mode/Super Bot Fight Mode.
- Cloudflare rate-limiting rules and proxying enabled.

The static site remains publicly readable. Client-side obfuscation, robots.txt,
or a user-agent block cannot prevent a determined scraper or volumetric DDoS.
Use Cloudflare edge controls for meaningful protection.

## Headers and crawler rules

`website/_headers` adds `nosniff`, frame, referrer, permissions, and
cross-origin resource policies. Content JSON and EPUB paths receive no-index
rules. `website/robots.txt` disallows `/data/` and `/assets/downloads/` while
keeping the public pages crawlable and references the sitemap.

The build rewrites `robots.txt`; edit the corresponding string in
`scripts/build.py` if the generated rule must change.

## Deployment

Recommended Cloudflare Pages Git settings:

```text
Root directory: repository root
Build command: python3 scripts/build.py
Build output directory: dist
```

Push source changes to the production branch and wait for Cloudflare's build.
The deployment must include the root `functions/` directory for Pages
Functions to exist. A direct static upload includes `website`/`dist` assets
but does not provide the Functions endpoints.

Useful deployment checks:

```sh
curl -i -X POST https://twatf.pages.dev/github-discussion-webhook
curl -I https://twatf.pages.dev/data/catalog.json
curl -i -A "WebToEpub" https://twatf.pages.dev/data/catalog.json
```

Expected webhook results:

- `401`: endpoint exists but the request signature is invalid.
- `503`: endpoint exists but required Cloudflare variables are missing.
- `405`: wrong HTTP method.
- `200`: valid GitHub delivery accepted.
- `404`: the Pages Function was not deployed or the route is wrong.

The local preview's `Server: CloudflarePagesPreview/1.0 Python/...` header
means the request did not reach Cloudflare and cannot test edge middleware.

## Safe change practices

- Read the relevant source and generator code before editing.
- Preserve existing cascade/import order and route behavior.
- Update both base HTML documents when shared markup changes:
  `website/index.html` and `website/chapters.html`.
- Update `scripts/build.py` when generated chapter output must change.
- Do not add duplicate IDs when duplicating controls; use classes and wire all
  instances.
- Keep server secrets out of frontend files and Git.
- Do not hand-edit `dist/`.
- Do not use destructive Git commands or revert unrelated worktree changes.
- Keep changes surgical and run the smallest relevant tests, followed by the
  full build tests when generator or shared UI code changes.

## Common pitfalls

1. **Editing only base HTML:** generated chapter pages may overwrite the
   change. Update `scripts/build.py` if the chapter generator replaces that
   section.
2. **Testing Functions locally:** `scripts/preview.py` serves static files and
   does not run Cloudflare Functions.
3. **Stale Giscus CSS:** Giscus themes load in a cross-origin iframe. Verify
   the deployed `giscus/dark.css`, `light.css`, and `admin.css`, and bump the
   theme cache version when necessary.
4. **Generic dialog CSS overriding settings styles:** `settings.css` is loaded
   late intentionally. Preserve its selectors and mobile rules.
5. **Sticky/scroll regressions:** broad body/html overflow rules can break the
   chapter index or mobile dialogs.
6. **Static security expectations:** robots and browser JavaScript are not
   access control. Cloudflare edge rules and Functions are required for
   enforcement.
7. **Set-Cookie folding in Workers / Pages:** Do not join multiple `Set-Cookie`
   headers with `, ` (e.g. `.join(', ')`) when constructing HTTP responses.
   In standard fetch and browser implementations, cookie attribute commas
   collide with the separator and corrupt cookies. Always use
   `response.headers.append('Set-Cookie', ...)` and extract existing cookies with
   `headers.getSetCookie()` in middleware wrappers.
8. **Relative import paths across nested Functions:** Cloudflare Pages Functions
   resolve imports relative to the subfolder where the handler file lives
   (e.g. `functions/api/comments/[id]/reactions/[emoji].js` requires
   `../../../../_lib/comments.js`).
9. **Typography styles leaking into comment UI:** Novel reading text uses high
   line-height and serif styling scoped to `<article>`. To prevent comments from
   inheriting article typography ("big quotes" appearance), render comments in
   `<div class="native-comment">` and scope styling with `font-family: var(--font-ui)`.
10. **Graceful D1 degradation:** Always check if `env.COMMENTS_DB` is bound
    before issuing queries; unconfigured D1 databases should return structured
    fallback JSON (e.g. `{ comments: [] }`) instead of unhandled 500 HTML error
    pages.

## Current validation baseline

The repository's test suite currently contains five build/regression tests.
They validate correction propagation, EPUB consistency, invalid-source safety,
missing chapters, whitespace handling, generated discovery metadata, canonical
URLs, navigation links, robots rules, and asset hashing.
