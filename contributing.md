# How to Contribute

Welcome to **TWATF-Reader**! 

Thank you for considering helping out. This project relies on fans to fix typos, improve formatting and keep the reading experience good for everyone.

**You do not need to be a programmer or know GitHub.** You cannot "break" the website by suggesting an edit, so feel free to jump in.

---

## The Easy Guide: How to Edit

You can edit chapters directly in your browser. You can also report problems on our [Discord server](https://discord.gg/YOUR-INVITE).

### Step 1: Find the chapter
1. Open the `chapters` folder in this repository.
2. Open the folder for the version you want (`original` or `revised`).
3. Open the `.md` file for the chapter. File `0001.md` is Chapter 1, `0002.md` is Chapter 2, and so on. (`0000.md` is only used for the EPUB.)

### Step 2: Click the pencil
1. Click the **pencil icon** ("Edit this file") at the top right of the file.
2. If you do not have a GitHub account, GitHub asks you to sign up. It is free.
3. GitHub makes you your own copy ("fork") of the project. This is normal.

### Step 3: Make your changes
Fix typos, add bold or italics, or correct spacing. Use the **Preview** tab to check how it looks.

### Step 4: Save and submit
1. Scroll down to **Commit changes** and write a short note, for example "Fixed typo in paragraph 3".
2. Click **Propose changes**, then **Create pull request** (twice to confirm).

Done! A maintainer will review your change and merge it into the site.

---

## Markdown Cheat Sheet

Chapters are written in **Markdown** (processed by Pandoc).

| You type | You get |
|---|---|
| `*text*` | *italic* (thoughts, emphasis) |
| `**text**` | **bold** (sound effects, shouting) |
| `---` on its own line | a scene break |
| `## Chapter 1: Title` | a heading |

A blank line between two blocks of text starts a new paragraph.

---

## Footnotes

Translation notes (T/N) can be written inline, inside the sentence:

```text
The Stone of Regression^[A note for the reader goes here.] was discovered.
```

---

## Adding Images

1. Put the image in the `images` folder, inside the version's folder (for example `images/original/chapter1/scene.png`). Pictures are converted to `.webp` automatically.
2. In the chapter file, refer to it with this path:

```text
![](../../images/original/chapter1/scene.png)
```

---

## What should I fix?

- Typos and grammar
- Inconsistent names or terms
- Missing scene breaks or broken formatting
- Missing or wrong images

Thank you!
