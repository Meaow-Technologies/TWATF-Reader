# Discord Comments Migration Guide

This guide covers the work required to replace new Giscus comments with a
native Discord-backed comment system while keeping existing Giscus discussions
available as legacy comments.

## What you need to do

### 1. Create a Discord application

In the Discord Developer Portal:

1. Create an application for the TWATF Reader.
2. Open **OAuth2** and add this redirect URL:

   ```text
   https://twatf.pages.dev/api/auth/discord/callback
   ```

3. Copy the application **Client ID** and generate a **Client Secret**.
4. Keep the client secret private. Do not commit it to this repository.

For local development, also add the equivalent local callback URL if needed,
for example:

```text
http://localhost:8788/api/auth/discord/callback
```

### 2. Create a Cloudflare D1 database

In the Cloudflare dashboard or with Wrangler:

1. Create a D1 database, for example `twatf-comments`.
2. Record its database ID.
3. Add the database binding to the Pages project configuration:

   ```text
   Binding variable name: COMMENTS_DB
   ```

4. Apply `functions/schema.sql` to the database. With Wrangler, this is
   equivalent to:

   ```sh
   npx wrangler d1 execute twatf-comments --remote --file=functions/schema.sql
   ```

   Replace `twatf-comments` with your actual D1 database name.

The database will store users, sessions, comments, replies, reactions, and
legacy-comment identifiers.

### 3. Configure Cloudflare secrets and variables

Add these as encrypted Cloudflare Pages production secrets:

```text
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
SESSION_SECRET
GITHUB_DISCUSSIONS_TOKEN
```

`GITHUB_DISCUSSIONS_TOKEN` is only required for importing old Giscus
discussions. It should be a fine-grained GitHub token with read access to
Discussions in `Meaow-Technologies/TWATF-Reader`. (Note: when adding as a
GitHub Actions Secret for the migration workflow, name it `GH_DISCUSSIONS_TOKEN`
because GitHub reserves secret names starting with `GITHUB_`).

Add non-secret configuration values as Cloudflare variables where appropriate,
such as:

```text
DISCORD_REDIRECT_URI=https://twatf.pages.dev/api/auth/discord/callback
```

Use separate credentials and values for preview or local environments.

### 4. Confirm the GitHub Discussions mapping

Before migration, verify that the existing Giscus categories and discussions
are correct for both editions:

- First Edition
- Revised Edition

The migration needs a mapping from each current Giscus discussion to a stable
chapter key such as:

```text
first:1
revised:1
```

If discussion titles or terms do not uniquely identify chapters, provide or
approve a mapping file before running the import.

### 5. Decide the Discord notification policy

Choose whether new native comments should post notifications to Discord:

- **Recommended:** notify a dedicated channel through a Discord webhook.
- Keep the existing GitHub Discussion webhook only for legacy Giscus activity,
  or disable it after migration.

If notifications are wanted, create a Discord webhook and provide its URL as a
Cloudflare secret. Never place the webhook URL in frontend JavaScript.

### 6. Decide moderation rules

Before launch, confirm:

- Maximum comment length.
- Whether Markdown is allowed and which syntax is supported.
- Whether users can edit comments.
- Whether users can delete comments.
- Who has administrator/moderator permissions.
- Whether Discord accounts must belong to a particular server.
- Whether comments require a cooldown or rate limit.
- Which words or content should be blocked.

The implementation can use conservative defaults, but these policies should be
known before production launch.

### 7. Plan the rollout

Recommended rollout:

1. Deploy the database schema and API without replacing Giscus.
2. Test Discord login and commenting in a preview environment.
3. Run a dry-run Giscus migration and review its counts/errors.
4. Import legacy comments into D1.
5. Deploy the native comments UI with Giscus collapsed below it.
6. Monitor authentication, comment creation, and rate-limit errors.
7. Keep Giscus read-only and available for historical continuity.

## What I will do in code

### Backend

- Add the D1 schema and migration files.
- Add Cloudflare Pages Functions for:
  - Discord OAuth login.
  - OAuth callback handling.
  - Secure session creation and logout.
  - Current-user lookup.
  - Comment and reply APIs.
  - Editing and deletion.
  - Comment and chapter reactions.
  - Validation, authorization, and rate limiting.
- Add explicit error responses for unavailable or misconfigured services.
- Add optional native-comment Discord webhook notifications.
- Update middleware and headers for the new API routes.

### Frontend

- Replace the primary Giscus comment area with a native comments component.
- Add Discord sign-in and sign-out controls.
- Add comment composition, replies, reactions, editing, and deletion.
- Add loading, empty, error, and authentication states.
- Add comment counts and lazy loading.
- Preserve the current theme variables, responsive behavior, and chapter routes.
- Keep Giscus in a collapsed **Legacy GitHub Comments** section.
- Ensure each edition/chapter uses a stable, collision-free comment key.

### Migration

- Add a GitHub GraphQL migration script.
- Read the existing Giscus discussion mapping.
- Import comments, replies, authors, timestamps, and supported reactions.
- Mark imported records as legacy.
- Preserve original GitHub IDs for idempotent reruns.
- Support dry runs, cached results, batching, and resumable imports.
- Report missing discussions, malformed mappings, and API failures explicitly.

The migration command is:

```sh
GITHUB_DISCUSSIONS_TOKEN=your_token node scripts/migrate_giscus.mjs
```

This performs a dry run. Add `--apply` to generate
`scripts/out/migrate_giscus.sql`, review it, and execute it against the
`COMMENTS_DB` database:

```sh
npx wrangler d1 execute twatf-comments --remote --file=scripts/out/migrate_giscus.sql
```

Replace `twatf-comments` with your actual D1 database name. The migration does
not reuse GitHub numeric comment IDs, so it cannot collide with newly-created
native comments.

### Tests and documentation

- Add tests for:
  - OAuth state and callback validation.
  - Session handling.
  - Comment validation and permissions.
  - Replies and reactions.
  - Rate limiting.
  - Legacy-comment migration and reruns.
- Update deployment documentation and environment-variable examples.
- Run the existing build, JavaScript checks, and regression tests.
- Verify generated chapter pages retain the new comments section.

## Information I need before implementation

Please provide or confirm these decisions before the production portion is
implemented:

1. Discord application and OAuth credentials will be created by you and stored
   only in Cloudflare secrets.
2. The D1 database name and binding name.
3. Whether GitHub login should remain available alongside Discord login.
4. Whether a Discord server membership should be required.
5. Moderation and Markdown rules.
6. Whether native comments should send Discord webhook notifications.
7. Whether old Giscus comments should be imported into D1 or only shown in the
   legacy Giscus panel.
8. Whether deployment should target production immediately or a Cloudflare
   preview first.

## Important security rules

- Never commit Discord client secrets, session secrets, GitHub tokens, or
  webhook URLs.
- Do not put database credentials or OAuth secrets in `website/scripts/`.
- Use HTTPS redirect URLs in production.
- Restrict OAuth return paths to local site paths to prevent open redirects.
- Keep imported GitHub tokens out of migration logs and generated files.
- Back up the D1 database before importing legacy comments.
