# Personal website

Live site: https://sagnikmukherjee.github.io/

## Build

One-time setup:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Generate the blog pages and refresh asset versions:

```bash
.venv/bin/python build.py
```

Preview locally:

```bash
.venv/bin/python build.py --serve
```

Open http://localhost:8080. Stop any existing server on that port first.
The homepage lives in `index.html`, styles in `style.css`, and animations in
`art.js`. Add blog posts as Markdown in `posts/`; `draft: true` skips publishing
the generated post page (the source remains visible in the repository).

## Publish

Build, commit the source changes and generated `blog/` pages, then push to `main`:

```bash
.venv/bin/python build.py
git add index.html blog/ style.css art.js posts/ templates/
git commit -m "Update website"
git push origin main
```

Stage any additional changed assets explicitly. GitHub Pages is configured to
deploy from the `main` branch, `/ (root)`. Pushing triggers the Pages deployment;
check the repository's Actions tab for completion. No separate upload is needed.
