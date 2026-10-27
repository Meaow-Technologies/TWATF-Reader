#!/usr/bin/env python3
"""Build static chapters and EPUB 3 downloads from the same repository sources.
Requires only Python 3.9+; no third-party packages or first EPUB files.
"""

import argparse
import copy
import datetime
import hashlib
import html
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://twatf.pages.dev"
EDITIONS = {"first": "First", "revised": "Revised"}
EDITION_NAMES = {"first": "First Edition", "revised": "Revised Edition"}
EPUB_NAMES = {
    "first": "The_World_After_The_Fall_First_Edition",
    "revised": "The_World_After_The_Fall_Revised",
}
COVER_FILES = {
    "first": "images/first_upscaled.png",
    "revised": "images/revised_upscaled_2.png",
}
# Web-optimised covers (used in HTML; originals kept for EPUBs)
COVER_WEBP = {
    "first": "images/first-cover.webp",
    "revised": "images/revised-cover.webp",
}
NS = "{http://www.w3.org/1999/xhtml}"
ALLOWED = {
    "body",
    "p",
    "br",
    "hr",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "em",
    "strong",
    "b",
    "i",
    "blockquote",
    "sup",
    "sub",
    "ul",
    "ol",
    "li",
    "span",
}
STYLE = "body{font-family:serif;line-height:1.6;margin:5%;}h1,h2{line-height:1.3;}p{margin:1em 0;}img{max-width:100%;} .cover{text-align:center;}"

# Separator lines to skip when building meta description
_SEP_RE = re.compile(r"^[\s\u2500-\u257F\u2014\u2013\*\-\~_|/\\=+.]+$")


def xml(value):
    return html.escape(str(value), quote=True)


def document(title, body):
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        + f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en"><head><title>{xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>{body}</body></html>'
    )


def read_chapters(root, edition):
    files = sorted((root / "chapters" / edition).glob("*.xhtml"))
    if not files:
        raise ValueError(f"No chapters found for {edition}")
    rows = []
    for path in files:
        if not re.fullmatch(r"\d{4,}\.xhtml", path.name):
            raise ValueError(f"Invalid chapter filename: {path}")
        number = int(path.stem)
        try:
            tree = ET.parse(path).getroot()
        except ET.ParseError as e:
            raise ValueError(f"{path}: invalid XHTML: {e}") from e
        title = tree.find(f"{NS}head/{NS}title")
        body = tree.find(f"{NS}body")
        if title is None or not (title.text or "").strip() or body is None:
            raise ValueError(f"{path}: title and body required")
        body = copy.deepcopy(body)
        # Whitespace after </body> belongs to the document, not the chapter fragment.
        body.tail = None
        for el in body.iter():
            el.tag = el.tag.removeprefix(NS)
            if el.tag not in ALLOWED or el.attrib:
                raise ValueError(
                    f"{path}: unsupported element/attributes: {el.tag} {el.attrib}"
                )
        if not "".join(body.itertext()).strip():
            raise ValueError(f"{path}: empty chapter")
        fragment = ET.tostring(body, encoding="unicode", method="xml")[6:-7]
        rows.append(
            {
                "number": number,
                "title": title.text.strip(),
                "html": fragment,
                "words": len(" ".join(body.itertext()).split()),
                "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    rows.sort(key=lambda c: c["number"])
    if [c["number"] for c in rows] != list(range(1, len(rows) + 1)):
        raise ValueError(
            f"{edition}: chapter numbers must be unique and contiguous from 1"
        )
    return rows


def build_epub(target, edition, rows, cover, modified):
    title = f"The World After the Fall — {EDITIONS[edition]}"
    identifier = f"urn:twatf:{edition}"
    items = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="style" href="style.css" media-type="text/css"/>',
        '<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>',
        '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    ]
    items += [
        f'<item id="c{c["number"]}" href="chapter-{c["number"]}.xhtml" media-type="application/xhtml+xml"/>'
        for c in rows
    ]
    spine = '<itemref idref="cover"/>' + "".join(
        f'<itemref idref="c{c["number"]}"/>' for c in rows
    )
    opf = f"""<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">{identifier}</dc:identifier><dc:title>{xml(title)}</dc:title><dc:creator>Sing Shong</dc:creator><dc:language>en</dc:language><dc:description>{xml(EDITIONS[edition])} edition, regenerated from the reader's current chapter sources.</dc:description><meta property="dcterms:modified">{modified}</meta><meta name="cover" content="cover-image"/></metadata><manifest>{''.join(items)}</manifest><spine toc="ncx">{spine}</spine></package>"""
    toc = "".join(
        f'<li><a href="chapter-{c["number"]}.xhtml">{xml(c["title"])}</a></li>'
        for c in rows
    )
    nav = document(
        "Contents",
        f'<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{toc}</ol></nav>',
    )
    points = "".join(
        f'<navPoint id="c{c["number"]}" playOrder="{i+1}"><navLabel><text>{xml(c["title"])}</text></navLabel><content src="chapter-{c["number"]}.xhtml"/></navPoint>'
        for i, c in enumerate(rows)
    )
    ncx = f'<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="{identifier}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>{xml(title)}</text></docTitle><navMap>{points}</navMap></ncx>'
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        z.writestr("OEBPS/content.opf", opf)
        z.writestr("OEBPS/nav.xhtml", nav)
        z.writestr("OEBPS/toc.ncx", ncx)
        z.writestr("OEBPS/style.css", STYLE)
        z.write(cover, "OEBPS/cover.png")
        z.writestr(
            "OEBPS/cover.xhtml",
            document(
                title,
                '<div class="cover"><img src="cover.png" alt="Book cover"/></div>',
            ),
        )
        for c in rows:
            z.writestr(
                f'OEBPS/chapter-{c["number"]}.xhtml', document(c["title"], c["html"])
            )


def verify_epub(path, rows):
    with zipfile.ZipFile(path) as z:
        assert (
            z.infolist()[0].filename == "mimetype"
            and z.infolist()[0].compress_type == zipfile.ZIP_STORED
        )
        assert z.read("mimetype") == b"application/epub+zip"
        for name in z.namelist():
            if name.endswith((".xml", ".opf", ".ncx", ".xhtml")):
                ET.fromstring(z.read(name))
        opf = ET.fromstring(z.read("OEBPS/content.opf"))
        manifest = opf.find("{*}manifest")
        for item in manifest:
            assert "OEBPS/" + item.get("href") in z.namelist()
        spine = opf.find("{*}spine")
        assert len(spine) == len(rows) + 1
        for c in rows:
            actual = ET.fromstring(z.read(f'OEBPS/chapter-{c["number"]}.xhtml')).find(
                NS + "body"
            )
            expected = ET.fromstring("<body>" + c["html"] + "</body>")
            assert "".join(actual.itertext()) == "".join(
                expected.itertext()
            ), f'EPUB mismatch: {path} chapter {c["number"]}'


# ─── Head manipulation helpers ─────────────────────────────────────────────────

def _strip_tags(text):
    """Strip HTML tags from a string."""
    return re.sub(r"<[^>]+>", "", text)


def _chapter_snippet(chapter_html, max_chars=120):
    """Extract a short plain-text snippet from chapter HTML for use in meta descriptions.
    Skips heading/separator lines, strips tags, collapses whitespace, cuts at word boundary."""
    # Remove tags to get plain text
    plain = _strip_tags(chapter_html)
    # Split into lines/sentences and skip separator patterns
    lines = [l.strip() for l in plain.split("\n")]
    collected = []
    for line in lines:
        if not line:
            continue
        if _SEP_RE.fullmatch(line):
            continue
        collected.append(line)
        if len(" ".join(collected)) > max_chars:
            break
    snippet = " ".join(collected)
    snippet = re.sub(r"\s+", " ", snippet).strip()
    if len(snippet) > max_chars:
        # cut at word boundary
        snippet = snippet[:max_chars].rsplit(" ", 1)[0] + "…"
    return snippet


def _chapter_title_suffix(title):
    """Strip 'Chapter N - ' prefix from a title. Returns the remainder, or full title."""
    m = re.match(r"^Chapter\s+\d+\s*[-:]\s*", title, re.IGNORECASE)
    if m:
        rest = title[m.end():].strip()
        return rest if rest else title
    return title


def _remove_head_meta(markup):
    """Remove existing title, description, canonical, og:*, twitter:*, verification, ld+json from head."""
    # Remove <title>...</title>
    markup = re.sub(r'<title>[^<]*</title>\s*', '', markup, flags=re.IGNORECASE)
    # Remove <meta name="description" ...>
    markup = re.sub(r'<meta[^>]+name=["\']description["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    # Remove <link rel="canonical" ...>
    markup = re.sub(r'<link[^>]+rel=["\']canonical["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    # Remove og:* meta tags
    markup = re.sub(r'<meta[^>]+property=["\']og:[^"\']*["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    # Remove twitter:* meta tags
    markup = re.sub(r'<meta[^>]+name=["\']twitter:[^"\']*["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    # Remove google-site-verification meta
    markup = re.sub(r'<meta[^>]+name=["\']google-site-verification["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    # Remove application/ld+json script blocks
    markup = re.sub(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>.*?</script>\s*', '', markup, flags=re.IGNORECASE | re.DOTALL)
    # Remove <meta name="robots" ...>
    markup = re.sub(r'<meta[^>]+name=["\']robots["\'][^>]*/?\s*>\s*', '', markup, flags=re.IGNORECASE)
    return markup


def _insert_after_charset(markup, insertion):
    """Insert HTML immediately after the <meta charset> tag."""
    m = re.search(r'(<meta\s[^>]*charset[^>]*/?>)', markup, re.IGNORECASE)
    assert m, "No <meta charset> found"
    return markup[:m.end()] + "\n    " + insertion + markup[m.end():]


def _build_chapter_head(edition, n, count, title, chapter_html, canonical_url):
    """Build the <head> meta block for a chapter page."""
    suffix = _chapter_title_suffix(title)
    edition_name = EDITION_NAMES[edition]
    page_title = f"Chapter {n}: {suffix} | The World After the Fall ({edition_name})"
    snippet = _chapter_snippet(chapter_html)
    desc_prefix = f'Read Chapter {n}, "{suffix}", of The World After the Fall ({edition_name}) by Sing Shong online. '
    desc = desc_prefix + snippet
    if len(desc) > 160:
        # Trim snippet to fit
        available = 160 - len(desc_prefix)
        if available > 20:
            snippet2 = snippet[:available].rsplit(" ", 1)[0] + "…"
            desc = desc_prefix + snippet2
        else:
            desc = desc[:157] + "…"
    og_image = f"{SITE_URL}/assets/images/og-image.jpg"
    breadcrumb_items = [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/"},
        {"@type": "ListItem", "position": 2, "name": f"The World After the Fall — {edition_name}", "item": f"{SITE_URL}/{edition}"},
        {"@type": "ListItem", "position": 3, "name": f"Chapter {n}: {suffix}", "item": canonical_url},
    ]
    ld_json = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumb_items}, ensure_ascii=False)
    return "\n".join([
        f'<title>{xml(page_title)}</title>',
        f'<meta name="description" content="{xml(desc)}" />',
        f'<meta name="robots" content="index,follow" />',
        f'<link rel="canonical" href="{xml(canonical_url)}" />',
        f'<meta property="og:type" content="article" />',
        f'<meta property="og:site_name" content="The World After the Fall Reader" />',
        f'<meta property="og:title" content="{xml(page_title)}" />',
        f'<meta property="og:description" content="{xml(desc)}" />',
        f'<meta property="og:url" content="{xml(canonical_url)}" />',
        f'<meta property="og:image" content="{xml(og_image)}" />',
        f'<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{xml(page_title)}" />',
        f'<meta name="twitter:description" content="{xml(desc)}" />',
        f'<script type="application/ld+json">{ld_json}</script>',
    ])


def _build_edition_head(edition, count, canonical_url):
    """Build the <head> meta block for an edition index page."""
    edition_name = EDITION_NAMES[edition]
    page_title = f"The World After the Fall — {edition_name} ({count} chapters) | TWATF Reader"
    if edition == "first":
        desc = (f"Read The World After the Fall — First Edition by Sing Shong online. "
                f"The original 2016 publication with {count} chapters. Browse the full chapter list.")
    else:
        desc = (f"Read The World After the Fall — Revised Edition by Sing Shong online. "
                f"The revised and republished edition with {count} chapters. Browse the full chapter list.")
    if len(desc) > 160:
        desc = desc[:157] + "…"
    og_image = f"{SITE_URL}/assets/images/og-image.jpg"
    breadcrumb_items = [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/"},
        {"@type": "ListItem", "position": 2, "name": f"The World After the Fall — {edition_name}", "item": canonical_url},
    ]
    ld_json = json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumb_items}, ensure_ascii=False)
    return "\n".join([
        f'<title>{xml(page_title)}</title>',
        f'<meta name="description" content="{xml(desc)}" />',
        f'<meta name="robots" content="index,follow" />',
        f'<link rel="canonical" href="{xml(canonical_url)}" />',
        f'<meta property="og:type" content="website" />',
        f'<meta property="og:site_name" content="The World After the Fall Reader" />',
        f'<meta property="og:title" content="{xml(page_title)}" />',
        f'<meta property="og:description" content="{xml(desc)}" />',
        f'<meta property="og:url" content="{xml(canonical_url)}" />',
        f'<meta property="og:image" content="{xml(og_image)}" />',
        f'<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{xml(page_title)}" />',
        f'<meta name="twitter:description" content="{xml(desc)}" />',
        f'<script type="application/ld+json">{ld_json}</script>',
    ])


def _build_homepage_head():
    """Build the homepage-specific meta tags (after stripping old ones)."""
    page_title = "The World After the Fall (TWATF) – Read Online | TWATF Reader"
    desc = "Read The World After the Fall (TWATF) by Sing Shong online. First and Revised editions, bookmarks, reading settings and EPUB downloads."
    og_image = f"{SITE_URL}/assets/images/og-image.jpg"
    canonical = f"{SITE_URL}/"
    ld_json = json.dumps({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "The World After the Fall Reader",
        "alternateName": ["TWATF", "TWATF Reader"],
        "url": f"{SITE_URL}/"
    }, ensure_ascii=False)
    return "\n".join([
        f'<title>{xml(page_title)}</title>',
        f'<meta name="description" content="{xml(desc)}" />',
        f'<meta name="robots" content="index,follow" />',
        f'<link rel="canonical" href="{xml(canonical)}" />',
        f'<meta name="google-site-verification" content="oTbuVgkCfL34Q6NUgIAdPi7lpqYMtscVbU-0ZKBugUI" />',
        f'<meta property="og:type" content="website" />',
        f'<meta property="og:site_name" content="The World After the Fall Reader" />',
        f'<meta property="og:title" content="{xml(page_title)}" />',
        f'<meta property="og:description" content="{xml(desc)}" />',
        f'<meta property="og:url" content="{xml(canonical)}" />',
        f'<meta property="og:image" content="{xml(og_image)}" />',
        f'<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{xml(page_title)}" />',
        f'<meta name="twitter:description" content="{xml(desc)}" />',
        f'<script type="application/ld+json">{ld_json}</script>',
    ])


def _insert_head_block(markup, new_block):
    """Replace stripped head with new block (insert before </head>)."""
    assert "</head>" in markup.lower(), "No </head> found"
    idx = markup.lower().index("</head>")
    return markup[:idx] + "    " + new_block + "\n  " + markup[idx:]


def generate_chapter_pages(out, edition, rows, base_index_html):
    """Generate static chapter pages for one edition."""
    edition_dir = out / edition
    edition_dir.mkdir(parents=True, exist_ok=True)
    count = len(rows)

    for i, c in enumerate(rows):
        n = c["number"]
        canonical = f"{SITE_URL}/{edition}/chapter-{n}"
        markup = base_index_html

        # 1. Strip old head meta
        markup = _remove_head_meta(markup)

        # 2. Insert <base href="/"> after <meta charset>
        markup = _insert_after_charset(markup, '<base href="/" />')

        # 3. Insert new head block
        new_head = _build_chapter_head(edition, n, count, c["title"], c["html"], canonical)
        markup = _insert_head_block(markup, new_head)

        # 4. Make #home hidden
        markup = re.sub(r'(<main\s[^>]*id=["\']home["\'][^>]*?)(?<!\bhidden\b)>', lambda m: m.group(1) + ' hidden>', markup, count=1)

        # 5. Remove hidden from #reader section
        markup = re.sub(r'(<section\s[^>]*id=["\']reader["\'][^>]*?)\s+hidden', r'\1', markup, count=1)

        # 5b. Replace <h1> tags inside the hidden #home section with <h2 class="sr-only">
        # so only the chapter's own <h1> (in the chapter content) remains
        def replace_home_h1(m):
            section = m.group(0)
            section = re.sub(r'<h1([^>]*)>', r'<h2 class="sr-only"\1>', section)
            section = re.sub(r'</h1>', r'</h2>', section)
            return section
        markup = re.sub(
            r'<main\s[^>]*id=["\']home["\'][^>]*hidden[^>]*>.*?</main>',
            replace_home_h1, markup, count=1, flags=re.DOTALL,
        )
        # Also hide the chapter-index h1
        def replace_index_h1(m):
            section = m.group(0)
            section = re.sub(r'<h1([^>]*)>', r'<h2 class="sr-only"\1>', section)
            section = re.sub(r'</h1>', r'</h2>', section)
            return section
        markup = re.sub(
            r'<main\s[^>]*id=["\']chapter-index["\'][^>]*>.*?</main>',
            replace_index_h1, markup, count=1, flags=re.DOTALL,
        )

        # 6. Set chapter content in <article id="chapter">
        edition_label = f'{"First Edition" if edition == "first" else "Revised"} / {n} of {count}'
        chapter_html_fragment = c["html"]
        markup = re.sub(
            r'<article\s[^>]*id=["\']chapter["\'][^>]*>.*?</article>',
            f'<article id="chapter" tabindex="-1" data-prerendered="{edition}/{n}">{chapter_html_fragment}</article>',
            markup,
            count=1,
            flags=re.DOTALL,
        )

        # 7. Set #edition-label
        markup = re.sub(
            r'(<span\s[^>]*id=["\']edition-label["\'][^>]*>)[^<]*(</span>)',
            rf'\g<1>{xml(edition_label)}\g<2>',
            markup, count=1,
        )

        # 8. Single, unified .reader-nav with real SEO rel="prev"/rel="next" links
        if i == 0:
            prev_html = '<button id="prev" disabled>← Previous</button>'
        else:
            prev_n = rows[i - 1]["number"]
            prev_html = f'<a id="prev" rel="prev" href="/{edition}/chapter-{prev_n}">← Previous</a>'

        chapters_html = '<button id="chapter-list" aria-haspopup="dialog" aria-controls="contents">Chapters</button>'

        if i == count - 1:
            next_html = '<button id="next" disabled>Next →</button>'
        else:
            next_n = rows[i + 1]["number"]
            next_html = f'<a id="next" rel="next" href="/{edition}/chapter-{next_n}">Next →</a>'

        single_reader_nav = f'<div class="reader-nav">\n        {prev_html}\n        {chapters_html}\n        {next_html}\n      </div>'
        markup = re.sub(
            r'<div\s[^>]*class=["\'][^"\']*reader-nav[^"\']*["\'][^>]*>.*?</div>',
            single_reader_nav,
            markup, count=1, flags=re.DOTALL,
        )

        # 9. Set #end-note
        end_note_text = "You have reached the end of this edition." if i == count - 1 else ""
        markup = re.sub(
            r'(<p\s[^>]*id=["\']end-note["\'][^>]*>)[^<]*(</p>)',
            rf'\g<1>{xml(end_note_text)}\g<2>',
            markup, count=1,
        )

        # Write file
        (edition_dir / f"chapter-{n}.html").write_text(markup, encoding="utf-8")


def generate_edition_page(out, edition, rows, base_chapters_html, books):
    """Generate a static edition index page (first.html or revised.html)."""
    count = len(rows)
    canonical = f"{SITE_URL}/{edition}"
    markup = base_chapters_html

    # 1. Strip old head meta
    markup = _remove_head_meta(markup)

    # 2. Insert <base href="/"> after <meta charset>
    markup = _insert_after_charset(markup, '<base href="/" />')

    # 3. Insert new head block
    new_head = _build_edition_head(edition, count, canonical)
    markup = _insert_head_block(markup, new_head)

    # 4. Add hidden to #home
    markup = re.sub(r'(<main\s[^>]*id=["\']home["\'][^>]*?)(?<!\bhidden\b)>', lambda m: m.group(1) + ' hidden>', markup, count=1)

    # 4b. Demote #home h1 so only #chapter-index has h1
    def replace_home_h1(m):
        section = m.group(0)
        section = re.sub(r'<h1([^>]*)>', r'<h2 class="sr-only"\1>', section)
        section = re.sub(r'</h1>', r'</h2>', section)
        return section
    markup = re.sub(
        r'<main\s[^>]*id=["\']home["\'][^>]*>.*?</main>',
        replace_home_h1, markup, count=1, flags=re.DOTALL,
    )

    # 5. Remove hidden from #chapter-index (chapters.html has it without hidden)
    # chapters.html <main id="chapter-index"> may or may not have hidden
    markup = re.sub(r'(<main\s[^>]*id=["\']chapter-index["\'][^>]*?)\s+hidden', r'\1', markup, count=1)

    # 6. Set the correct edition as selected in #index-version
    # Reset both options
    markup = markup.replace('value="first" selected', 'value="first"').replace('value="revised" selected', 'value="revised"')
    # Set the correct one
    markup = markup.replace(f'value="{edition}"', f'value="{edition}" selected')

    # 7. Set #index-cover src
    markup = re.sub(
        r'(id=["\']index-cover["\'][^>]*\s)src=["\'][^"\']*["\']',
        rf'\g<1>src="assets/{COVER_WEBP[edition]}"',
        markup, count=1,
    )

    # 8. Set #index-description
    edition_label = "First edition" if edition == "first" else "Revised edition"
    markup = re.sub(
        r'(<p\s[^>]*id=["\']index-description["\'][^>]*>)[^<]*(</p>)',
        rf'\g<1>{xml(edition_label)} · {count} chapters\g<2>',
        markup, count=1,
    )

    # 9. Set #index-count
    markup = re.sub(
        r'(<span\s[^>]*id=["\']index-count["\'][^>]*>)[^<]*(</span>)',
        rf'\g<1>{count} chapters\g<2>',
        markup, count=1,
    )

    # 10. Set #index-resume href
    markup = re.sub(
        r'(id=["\']index-resume["\'][^>]*\s)href=["\'][^"\']*["\']',
        rf'\g<1>href="/{edition}/chapter-1"',
        markup, count=1,
    )
    # Also replace the text content
    markup = re.sub(
        r'(<a\s[^>]*id=["\']index-resume["\'][^>]*>)[^<]*(</a>)',
        rf'\g<1>Start reading →\g<2>',
        markup, count=1,
    )

    # 11. Set #index-download href
    epub_name = f"assets/downloads/{EPUB_NAMES[edition]}.epub"
    markup = re.sub(
        r'(id=["\']index-download["\'][^>]*\s)href=["\'][^"\']*["\']',
        rf'\g<1>href="{epub_name}"',
        markup, count=1,
    )

    # 12. Pre-render chapter cards into #index-results
    # The build has already substituted <!-- CHAPTER_CARDS --> into #index-results with revised cards
    # We need to replace those with this edition's cards
    edition_cards = "".join(
        f'<a class="chapter-card" href="/{edition}/chapter-{c["number"]}"><small>CHAPTER {c["number"]}</small><h3>{xml(c["title"])}</h3></a>'
        for c in rows
    )
    markup = re.sub(
        r'(<div\s[^>]*id=["\']index-results["\'][^>]*>).*?(</div>)',
        rf'\g<1>{edition_cards}\g<2>',
        markup, count=1, flags=re.DOTALL,
    )

    # 13. Ensure exactly one <h1> — the existing h1 ("The World<br />After the Fall") is fine.
    # But add a visible edition title as a subtitle if needed, or add sr-only h1 for the edition page.
    # Check if <h1> already exists in the markup
    h1_count = len(re.findall(r'<h1[^>]*>', markup, re.IGNORECASE))
    if h1_count == 0:
        # Add sr-only h1
        edition_name = EDITION_NAMES[edition]
        sr_h1 = f'<h1 class="sr-only">The World After the Fall — {edition_name}</h1>'
        markup = re.sub(r'(<main\s[^>]*id=["\']chapter-index["\'][^>]*>)', r'\g<1>' + sr_h1, markup, count=1)

    (out / f"{edition}.html").write_text(markup, encoding="utf-8")


def generate_sitemap(out, books):
    """Generate sitemap.xml with all indexable URLs."""
    urls = [f"{SITE_URL}/"]
    urls.append(f"{SITE_URL}/first")
    urls.append(f"{SITE_URL}/revised")
    urls.append(f"{SITE_URL}/info")
    for edition in ("first", "revised"):
        for c in books[edition]:
            urls.append(f"{SITE_URL}/{edition}/chapter-{c['number']}")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
    ]
    for url in urls:
        lines.append(f"  <url>\n    <loc>{xml(url)}</loc>\n  </url>")
    lines.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return urls


def update_homepage(out, books):
    """Update out/index.html: fix card hrefs, update resume href, add browse-editions nav."""
    p = out / "index.html"
    markup = p.read_text(encoding="utf-8")

    # Replace generated card hrefs for revised from "index.html#read/revised/N" to "/revised/chapter-N"
    markup = re.sub(
        r'href="index\.html#read/revised/(\d+)"',
        lambda m: f'href="/revised/chapter-{m.group(1)}"',
        markup,
    )

    # Also fix first edition cards if any
    markup = re.sub(
        r'href="index\.html#read/first/(\d+)"',
        lambda m: f'href="/first/chapter-{m.group(1)}"',
        markup,
    )

    # Add browse-editions nav if not present
    if 'class="browse-editions"' not in markup:
        browse_nav = (
            '\n          <nav class="browse-editions" aria-label="Resume reading by edition">\n'
            '            <a id="resume-first" href="/first/chapter-1">First Edition (Chapter 1)</a>\n'
            '            <a id="resume-revised" href="/revised/chapter-1">Revised Edition (Chapter 1)</a>\n'
            '          </nav>'
        )
        # Insert after #resume-note paragraph
        markup = re.sub(
            r'(</p>\s*\n\s*</div>\s*\n\s*</section>\s*\n\s*</main>\s*\n\s*<main id="chapter-index")',
            browse_nav + r'\n        \1',
            markup, count=1,
        )

    p.write_text(markup, encoding="utf-8")


def update_chapters_page(out, books):
    """Update out/chapters.html: fix card hrefs and update resume href."""
    p = out / "chapters.html"
    markup = p.read_text(encoding="utf-8")

    # Replace generated card hrefs
    markup = re.sub(
        r'href="index\.html#read/revised/(\d+)"',
        lambda m: f'href="/revised/chapter-{m.group(1)}"',
        markup,
    )
    markup = re.sub(
        r'href="index\.html#read/first/(\d+)"',
        lambda m: f'href="/first/chapter-{m.group(1)}"',
        markup,
    )

    p.write_text(markup, encoding="utf-8")


def assert_no_placeholders(pages):
    """Assert no {{ }} placeholders remain in generated pages."""
    for page in pages:
        content = page.read_text(encoding="utf-8")
        assert "{{" not in content, f"Leftover placeholder in {page}: {re.search(r'{{[^}}]*}}', content).group()}"


def assert_unique_titles_and_canonicals(pages):
    """Assert all generated pages have unique titles and canonical URLs."""
    titles = {}
    canonicals = {}
    for page in pages:
        content = page.read_text(encoding="utf-8")
        # Check exactly one <title>
        title_matches = re.findall(r'<title>([^<]+)</title>', content, re.IGNORECASE)
        assert len(title_matches) == 1, f"{page}: expected 1 <title>, found {len(title_matches)}"
        title = title_matches[0]
        assert title not in titles, f"Duplicate title '{title}' in {page} and {titles[title]}"
        titles[title] = page

        # Check canonical
        canon_matches = re.findall(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', content, re.IGNORECASE)
        if page.name == "404.html":
            assert len(canon_matches) == 0, f"{page}: 404 should not have canonical link"
        else:
            assert len(canon_matches) == 1, f"{page}: expected 1 canonical, found {len(canon_matches)}"
            canon = canon_matches[0]
            if page.name == "chapters.html":
                assert canon == f"{SITE_URL}/revised", f"{page}: chapters.html canonical should be {SITE_URL}/revised"
            else:
                assert canon not in canonicals, f"Duplicate canonical '{canon}' in {page} and {canonicals[canon]}"
                canonicals[canon] = page

        # Check exactly one <h1>
        h1_matches = re.findall(r'<h1[\s>]', content, re.IGNORECASE)
        assert len(h1_matches) == 1, f"{page}: expected 1 <h1>, found {len(h1_matches)}"

        # Check canonical/og URLs have no ?v= query
        for m in re.finditer(r'<link[^>]+rel=["\']canonical["\'][^>]+>', content, re.IGNORECASE):
            assert "?v=" not in m.group(), f"{page}: ?v= in canonical: {m.group()}"
        for m in re.finditer(r'<meta[^>]+property=["\']og:url["\'][^>]+>', content, re.IGNORECASE):
            assert "?v=" not in m.group(), f"{page}: ?v= in og:url: {m.group()}"


def build(root=ROOT):
    root = Path(root)
    books = {v: read_chapters(root, v) for v in EDITIONS}
    modified = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    # Stage and verify everything before replacing generated output.
    with tempfile.TemporaryDirectory(prefix=".build-", dir=root) as temporary:
        out = Path(temporary) / "dist"
        shutil.copytree(root / "website", out)
        (out / "assets" / "downloads").mkdir(parents=True, exist_ok=True)
        catalog = {}
        for v, rows in books.items():
            folder = out / "data" / v
            folder.mkdir(parents=True, exist_ok=True)
            catalog[v] = []
            for c in rows:
                path = f'data/{v}/{c["number"]}.json'
                (out / path).write_text(
                    json.dumps(
                        {"title": c["title"], "html": c["html"]}, ensure_ascii=False
                    ),
                    encoding="utf-8",
                )
                catalog[v].append(
                    {k: c[k] for k in ["number", "title", "words"]} | {"path": path}
                )
            build_epub(
                out / "assets" / "downloads" / f"{EPUB_NAMES[v]}.epub",
                v,
                rows,
                out / "assets" / COVER_FILES[v],
                modified,
            )
            verify_epub(out / "assets" / "downloads" / f"{EPUB_NAMES[v]}.epub", rows)
        (out / "data/catalog.json").write_text(
            json.dumps(catalog, ensure_ascii=False), encoding="utf-8"
        )
        # Build chapter cards (default for homepage/chapters page: revised edition)
        cards = "".join(
            f'<a class="chapter-card" href="/revised/chapter-{c["number"]}"><small>CHAPTER {c["number"]}</small><h3>{xml(c["title"])}</h3></a>'
            for c in books["revised"]
        )
        for page in ["index.html", "chapters.html"]:
            p = out / page
            s = p.read_text(encoding="utf-8")
            assert "<!-- CHAPTER_CARDS -->" in s
            s = (
                s.replace("<!-- CHAPTER_CARDS -->", cards)
                .replace("{{FIRST_COUNT}}", str(len(books["first"])))
                .replace("{{REVISED_COUNT}}", str(len(books["revised"])))
            )
            p.write_text(s, encoding="utf-8")
        p = out / "info.html"
        s = (
            p.read_text(encoding="utf-8")
            .replace("{{FIRST_COUNT}}", str(len(books["first"])))
            .replace("{{REVISED_COUNT}}", str(len(books["revised"])))
        )
        p.write_text(s, encoding="utf-8")

        # Update homepage meta and browse-editions nav
        idx_p = out / "index.html"
        idx_s = idx_p.read_text(encoding="utf-8")
        idx_s = _remove_head_meta(idx_s)
        idx_s = _insert_head_block(idx_s, _build_homepage_head())
        # Add browse-editions nav if not present
        if 'class="browse-editions"' not in idx_s:
            browse_nav = (
                '\n          <nav class="browse-editions" aria-label="Resume reading by edition">\n'
                '            <a id="resume-first" href="/first/chapter-1">First Edition (Chapter 1)</a>\n'
                '            <a id="resume-revised" href="/revised/chapter-1">Revised Edition (Chapter 1)</a>\n'
                '          </nav>'
            )
            # Insert before closing </div> of .intro > .actions container (after resume-note)
            idx_s = re.sub(
                r'(id="resume-note"[^<]*</p>)',
                r'\1' + browse_nav,
                idx_s, count=1,
            )
        # Ensure index.html has exactly 1 h1 (in #home)
        def demote_index_h1(m):
            section = m.group(0)
            section = re.sub(r'<h1([^>]*)>', r'<h2 class="sr-only"\1>', section)
            section = re.sub(r'</h1>', r'</h2>', section)
            return section
        idx_s = re.sub(
            r'<main\s[^>]*id=["\']chapter-index["\'][^>]*>.*?</main>',
            demote_index_h1, idx_s, count=1, flags=re.DOTALL,
        )
        idx_p.write_text(idx_s, encoding="utf-8")

        # Ensure chapters.html has exactly 1 h1 (in #chapter-index)
        chap_p = out / "chapters.html"
        chap_s = chap_p.read_text(encoding="utf-8")
        def demote_home_h1(m):
            section = m.group(0)
            section = re.sub(r'<h1([^>]*)>', r'<h2 class="sr-only"\1>', section)
            section = re.sub(r'</h1>', r'</h2>', section)
            return section
        chap_s = re.sub(
            r'<main\s[^>]*id=["\']home["\'][^>]*>.*?</main>',
            demote_home_h1, chap_s, count=1, flags=re.DOTALL,
        )
        chap_p.write_text(chap_s, encoding="utf-8")

        # Version dynamic cover URLs too, so replacing an image refreshes both pages.
        cover_hash = hashlib.sha256(
            b"".join((out / "assets" / COVER_FILES[v]).read_bytes() for v in EDITIONS)
        ).hexdigest()[:12]
        app = out / "scripts" / "app.js"
        app.write_text(
            re.sub(
                r"(assets/images/(?:first-cover|revised-cover)\.webp)(?=[`'\"])",
                lambda m: m.group(1) + "?v=" + cover_hash,
                app.read_text(encoding="utf-8"),
            ),
            encoding="utf-8",
        )
        # Content hashes prevent stale scripts/styles and covers after a new static deployment.
        for page in out.glob("*.html"):
            markup = page.read_text(encoding="utf-8")

            def version_asset(match):
                name = match.group(2)
                try:
                    digest = hashlib.sha256((out / name).read_bytes()).hexdigest()[:12]
                except FileNotFoundError:
                    return match.group(0)  # skip missing files
                return match.group(1) + name + "?v=" + digest + '"'

            markup = re.sub(
                r'((?:src|href)=")((?:assets|styles|scripts)/[A-Za-z0-9_/-]+\.(?:js|css|jpg|png|webp))"',
                version_asset,
                markup,
            )
            page.write_text(markup, encoding="utf-8")

        # Save the processed base pages before generating subpages
        # (so they inherit ?v= hashed asset URLs)
        processed_index = (out / "index.html").read_text(encoding="utf-8")
        processed_chapters = (out / "chapters.html").read_text(encoding="utf-8")

        # Fix card hrefs in both base pages
        for page_path, markup in [(out / "index.html", processed_index), (out / "chapters.html", processed_chapters)]:
            content = page_path.read_text(encoding="utf-8")
            content = re.sub(
                r'href="index\.html#read/(revised|first)/(\d+)"',
                lambda m: f'href="/{m.group(1)}/chapter-{m.group(2)}"',
                content,
            )
            page_path.write_text(content, encoding="utf-8")

        # Re-read after href fix
        processed_index = (out / "index.html").read_text(encoding="utf-8")
        processed_chapters = (out / "chapters.html").read_text(encoding="utf-8")

        # Generate chapter pages for each edition
        for v, rows in books.items():
            generate_chapter_pages(out, v, rows, processed_index)

        # Generate edition pages
        for v, rows in books.items():
            generate_edition_page(out, v, rows, processed_chapters, books)

        # Generate sitemap.xml
        generate_sitemap(out, books)

        # Ensure robots.txt is correct (overwrite)
        (out / "robots.txt").write_text(
            "User-agent: *\nAllow: /\n\nSitemap: https://twatf.pages.dev/sitemap.xml\n",
            encoding="utf-8",
        )

        (out / "build-manifest.json").write_text(
            json.dumps(
                {
                    "built_at": modified,
                    "chapters": {
                        v: {str(c["number"]): c["source_sha256"] for c in rows}
                        for v, rows in books.items()
                    },
                    "epubs": {
                        v: hashlib.sha256(
                            (out / "assets" / "downloads" / f"{EPUB_NAMES[v]}.epub").read_bytes()
                        ).hexdigest()
                        for v in EDITIONS
                    },
                },
                indent=2,
            )
            + "\n"
        )

        # ── Assertions ────────────────────────────────────────────────────────
        # Collect all generated pages
        generated_pages = list(out.glob("*.html"))
        for v, rows in books.items():
            for c in rows:
                generated_pages.append(out / v / f"chapter-{c['number']}.html")

        assert_no_placeholders(generated_pages)
        assert_unique_titles_and_canonicals(generated_pages)

        # Check no ?v= in canonical/og URLs (already checked per-page above)
        # Verify sitemap parses as valid XML
        ET.parse(out / "sitemap.xml")

        destination = root / "dist"
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(out, destination)

    first_count = len(books["first"])
    revised_count = len(books["revised"])
    total_chapters = first_count + revised_count
    print(
        "Built website and EPUBs: "
        + ", ".join(f"{v}: {len(rows)} chapters" for v, rows in books.items())
    )
    print(f"Generated: {total_chapters} chapter pages, 2 edition pages")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    build(args.root)
