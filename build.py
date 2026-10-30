#!/usr/bin/env python3
"""Build the blog.

Reads Markdown from posts/ and writes HTML into blog/: one page per post,
plus blog/index.html listing them all (linked from "Blog" in the top bar).

    python3 build.py            # build
    python3 build.py --serve    # build, then serve on http://localhost:8080

Post format — posts/2026-09-11-some-slug.md:

    ---
    title: Why RL updates are sparse
    date: 2026-09-11
    summary: One line for link previews.                 # optional
    draft: true                                          # optional, skips it
    ---

    Markdown. $\\LaTeX$ works. ```python fenced code``` works.
"""

import html
import os
import re
import shutil
import sys
from datetime import datetime, timezone

import markdown

SITE_URL = "https://sagnikmukherjee.github.io"
AUTHOR = "Sagnik Mukherjee"

ROOT = os.path.dirname(os.path.abspath(__file__))
POSTS_DIR = os.path.join(ROOT, "posts")
BLOG_DIR = os.path.join(ROOT, "blog")
TEMPLATES = os.path.join(ROOT, "templates")

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)

# Code first, so `$5 and $6` inside a code block is never mistaken for math.
CODE_RE = re.compile(r"^```.*?^```|`[^`\n]+`", re.DOTALL | re.MULTILINE)
MATH_RE = re.compile(
    r"\$\$.+?\$\$"                     # $$ display $$
    r"|\\\[.+?\\\]"                     # \[ display \]
    r"|\\\(.+?\\\)"                     # \( inline \)
    r"|\$(?!\s)[^\n$]+?(?<!\s)\$",       # $ inline $
    re.DOTALL,
)
MATH_TOKEN = "zmathspanz%dzendz"
DATE_PREFIX_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-")
TAG_SPLIT_RE = re.compile(r"[,\s]+")


def parse_frontmatter(raw):
    """Return (meta dict, body). Deliberately tiny: key: value, one per line."""
    match = FRONTMATTER_RE.match(raw)
    if not match:
        return {}, raw

    meta = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip().lower()] = value.strip()
    return meta, raw[match.end():]


def parse_tags(value):
    if not value:
        return []
    return [t for t in TAG_SPLIT_RE.split(value.strip("[]")) if t]


def protect_math(text, store):
    """Swap math spans for placeholders so Markdown leaves the LaTeX alone."""

    def stash(chunk):
        def repl(match):
            store.append(match.group(0))
            return MATH_TOKEN % (len(store) - 1)
        return MATH_RE.sub(repl, chunk)

    out, pos = [], 0
    for code in CODE_RE.finditer(text):
        out.append(stash(text[pos:code.start()]))
        out.append(code.group(0))
        pos = code.end()
    out.append(stash(text[pos:]))
    return "".join(out)


def restore_math(html_text, store):
    for i, raw in enumerate(store):
        html_text = html_text.replace(MATH_TOKEN % i, html.escape(raw, quote=False))
    return html_text


def reading_time(text):
    return max(1, round(len(text.split()) / 220))


def first_paragraph(text):
    for block in text.split("\n\n"):
        block = block.strip()
        if not block or block.startswith(("#", ">", "!", "|", "```")):
            continue
        plain = re.sub(r"[*_`\[\]]|\(https?://[^)]*\)", "", block)
        plain = " ".join(plain.split())
        return plain[:197] + "…" if len(plain) > 200 else plain
    return ""


def wrap_tables(html_text):
    """Wide tables get their own scroll container so the page never scrolls."""
    return re.sub(
        r"(<table>.*?</table>)",
        r'<div class="table-scroll">\1</div>',
        html_text,
        flags=re.DOTALL,
    )


def load_posts():
    if not os.path.isdir(POSTS_DIR):
        return []

    md = markdown.Markdown(
        extensions=["extra", "sane_lists", "admonition", "toc"],
        output_format="html5",
    )

    posts = []
    for name in sorted(os.listdir(POSTS_DIR)):
        if not name.endswith((".md", ".markdown")):
            continue

        path = os.path.join(POSTS_DIR, name)
        with open(path, encoding="utf-8") as fh:
            meta, body = parse_frontmatter(fh.read())

        if meta.get("draft", "").lower() in ("true", "yes", "1"):
            print(f"  skip (draft)  {name}")
            continue

        stem = os.path.splitext(name)[0]
        slug = meta.get("slug") or DATE_PREFIX_RE.sub("", stem)

        date_raw = meta.get("date") or (stem[:10] if DATE_PREFIX_RE.match(stem) else "")
        try:
            date = datetime.strptime(date_raw, "%Y-%m-%d")
        except ValueError:
            raise SystemExit(
                f"{name}: needs a date — either a 'date: YYYY-MM-DD' field "
                f"or a YYYY-MM-DD- filename prefix (got {date_raw!r})"
            )

        md.reset()
        math_store = []
        posts.append(
            {
                "slug": slug,
                "title": meta.get("title") or slug.replace("-", " ").capitalize(),
                "date": date,
                "tags": parse_tags(meta.get("tags")),
                "summary": meta.get("summary") or first_paragraph(body),
                "content": restore_math(
                    wrap_tables(md.convert(protect_math(body, math_store))), math_store
                ),
                "reading_time": reading_time(body),
                "url": f"{SITE_URL}/blog/{slug}.html",
                "source": name,
            }
        )

    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def render(template_name, **fields):
    with open(os.path.join(TEMPLATES, template_name), encoding="utf-8") as fh:
        out = fh.read()
    for key, value in fields.items():
        out = out.replace("{{%s}}" % key, value)
    return out


def post_list_items(posts):
    """Title, date and one-line summary per post, newest first."""
    if not posts:
        return '  <p class="empty">Nothing here yet — first post soon.</p>'
    rows = []
    for post in posts:
        summary = f'\n      <p>{html.escape(post["summary"])}</p>' if post["summary"] else ""
        rows.append(
            f'    <li>\n'
            f'      <a class="title" href="/blog/{post["slug"]}.html">{html.escape(post["title"])}</a>\n'
            f'      <time datetime="{post["date"]:%Y-%m-%d}">{post["date"]:%B %-d, %Y}</time>'
            f'{summary}\n'
            f'    </li>'
        )
    return '  <ul class="posts">\n' + "\n".join(rows) + "\n  </ul>"


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def build_posts(posts):
    os.makedirs(BLOG_DIR, exist_ok=True)

    # Drop pages whose Markdown source is gone, so deletes propagate.
    live = {f"{p['slug']}.html" for p in posts} | {"index.html"}
    for stale in os.listdir(BLOG_DIR):
        if stale.endswith(".html") and stale not in live:
            os.remove(os.path.join(BLOG_DIR, stale))
            print(f"  removed       blog/{stale}")

    for post in posts:
        write(
            os.path.join(BLOG_DIR, f"{post['slug']}.html"),
            render(
                "post.html",
                title=html.escape(post["title"]),
                summary=html.escape(post["summary"]),
                date=f'{post["date"]:%B %-d, %Y}',
                date_iso=post["date"].strftime("%Y-%m-%d"),
                reading_time=str(post["reading_time"]),
                content=post["content"],
                url=post["url"],
            ),
        )
        print(f"  wrote         blog/{post['slug']}.html")

    write(
        os.path.join(BLOG_DIR, "index.html"),
        render("blog_index.html", posts=post_list_items(posts)),
    )
    print("  wrote         blog/index.html")


def stamp_assets():
    """Version the css/js links so a browser can never serve a stale stylesheet."""
    assets = {}
    for name in ("style.css", "site.js"):
        f = os.path.join(ROOT, name)
        if os.path.exists(f):
            assets[name] = int(os.path.getmtime(f))

    pages = [os.path.join(ROOT, "index.html")]
    pages += [os.path.join(BLOG_DIR, f)
              for f in os.listdir(BLOG_DIR) if f.endswith(".html")]

    for page in pages:
        if not os.path.exists(page):
            continue
        with open(page, encoding="utf-8") as fh:
            text = original = fh.read()
        for name, version in assets.items():
            text = re.sub(
                r'(/%s)(\?v=\d+)?' % re.escape(name),
                r'\g<1>?v=%d' % version,
                text,
            )
        if text != original:
            write(page, text)
    print(f"  stamped       css/js links (v={max(assets.values(), default=0)})")


def main():
    print("building…")
    posts = load_posts()
    build_posts(posts)
    stamp_assets()
    print(f"done — {len(posts)} post{'' if len(posts) == 1 else 's'}")

    if "--serve" in sys.argv:
        import http.server
        import socketserver

        class NoCache(http.server.SimpleHTTPRequestHandler):
            # a local preview should never show yesterday's page
            def end_headers(self):
                self.send_header("Cache-Control", "no-store")
                super().end_headers()

        os.chdir(ROOT)
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", 8080), NoCache) as srv:
            print("serving http://localhost:8080  (ctrl-c to stop)")
            srv.serve_forever()


if __name__ == "__main__":
    main()
