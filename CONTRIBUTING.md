# How to Contribute

Found a typo, awkward sentence, or formatting problem while reading **The
World After the Fall**? You can help fix it directly from the GitHub website.
You do not need to install anything or know how to code.

## What You Can Help With

You can suggest:

- Spelling, grammar, punctuation, or translation corrections.
- Missing, extra, or incorrectly formatted text.
- Incorrect chapter titles or headings.
- Empty or inaccurate footnote sections.

There are two editions:

- `chapters/first/` — the **First Edition** (247 chapters).
- `chapters/revised/` — the **Revised Edition** (267 chapters).

Make sure you edit the edition you were reading. If the same problem appears
in both editions, you may suggest the correction in both files.

## Edit a Chapter from Your Browser

### 1. Open the chapter

1. Go to the [TWATF-Reader repository](https://github.com/Meaow-Technologies/TWATF-Reader).
2. Click the green **Code** button if needed, then make sure you are on the
   **Code** tab.
3. Open the `chapters` folder.
4. Open either `first` or `revised`.
5. Find the chapter number. For example, chapter 1 is `0001.xhtml`, chapter 12
   is `0012.xhtml`, and chapter 267 is `0267.xhtml`.

### 2. Open the editor

1. Click the chapter file.
2. Click the pencil icon in the top-right corner. It may say **Edit this file**
   when you move your mouse over it.
3. GitHub may ask you to **Fork this repository**. Click **Fork this
   repository** or **Create fork**. This simply creates your own copy so you
   can safely suggest a change.

### 3. Find and correct the text

The file contains some symbols such as `<p>` and `</p>`. These tell the reader
how to format the chapter.

Use your browser's find feature to locate the sentence:

- Windows or Linux: press `Ctrl+F`.
- Mac: press `Command+F`.

Change only the text that needs correcting. Leave the surrounding formatting
symbols in place.

For example, change:

```text
<p>He walk towards the tower.</p>
```

to:

```text
<p>He walks towards the tower.</p>
```

Do not delete `<p>`, `</p>`, `<strong>`, or similar symbols unless you are
also correcting formatting and understand the change.

### 4. Save your suggestion

1. Scroll to the bottom of the page.
2. In the **Commit changes** box, write a short description, such as
   `Fix typo in Revised Chapter 12`.
3. Select **Create a new branch for this commit and start a pull request**.
   Do not select the option to commit directly to `main`.
4. Click **Propose changes**.

### 5. Create the pull request

GitHub will open a new page. This is your change proposal.

1. Check that the title clearly describes the correction.
2. In the description, tell us:
   - Which edition and chapter you changed.
   - What was wrong.
   - What you changed it to.
3. Click **Create pull request**.

That is all! A maintainer will review your suggestion and may ask questions
before merging it. Please do not worry about making a mistake: your proposed
changes do not alter the main website until they are reviewed and accepted.

## Simple Formatting Rules

When editing a chapter:

- Keep the chapter filename and number unchanged.
- Keep formatting symbols paired: `<p>...</p>`, `<em>...</em>`, and
  `<strong>...</strong>`.
- Write `&amp;` instead of a literal `&` inside chapter text.
- Write `&lt;` instead of `<` and `&gt;` instead of `>`.
- Keep the chapter title in the `<title>` and visible heading unchanged unless
  the title itself is the correction.
- Do not add links, scripts, or custom HTML.

If you are unsure about a formatting symbol, leave it unchanged and explain
the correction in your pull request. Someone can help finish it.

## Before You Submit

Please check:

- You edited the correct edition and chapter.
- You changed only the intended text.
- The sentence still reads naturally.
- You described the correction in the pull request.

You do not need to run tests or build the project when editing through the
website. The project automatically checks proposed changes and rebuilds the
reader and EPUBs after a correction is accepted.

## Need Help?

If you are unsure what to change, open an issue or ask in the
[Discord server](https://discord.gg/mRKHnmQnYJ). Include the edition, chapter
number, and a short description of the problem.

Thank you for helping make the reader better!

## Optional: Contributing from Your Computer

If you already use Git and want to make many changes, you can work locally.
Clone the repository, create a branch, edit the chapter files, and run:

```bash
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

Do not edit or commit generated files in `dist/`.
