---
title: How this blog works
date: 2026-09-11
tags: [meta]
draft: true
summary: Write Markdown in posts/, run build.py, commit. That is the whole system.
---

This is a placeholder post that doubles as documentation. Delete it whenever.

## Writing a post

Make a file in `posts/` named `YYYY-MM-DD-some-slug.md`:

```markdown
---
title: Why RL updates are sparse
date: 2026-09-11
tags: [rl, training-dynamics]
summary: Optional. Used on the index and in link previews.
draft: true
---

Your text here.
```

Everything except `title` is optional. The date can also come from the filename
prefix. `draft: true` keeps a post out of the build until you remove the line.
The published URL is `/blog/some-slug.html`.

## Building

```bash
python3 build.py           # regenerate blog/ and the blog index
python3 build.py --serve   # same, then serve at localhost:8000
```

That regenerates every post page and the blog index. Commit the generated files along with the
Markdown — GitHub Pages serves them as-is, with no build of its own.

## What you get for free

Math renders through KaTeX, inline like $\nabla_\theta J(\theta)$ or as a block:

$$
\mathcal{L}(\theta) = -\mathbb{E}_{\tau \sim \pi_\theta} \left[ \sum_t r_t \right]
$$

Code blocks get syntax highlighting in both light and dark mode:

```python
def advantage(rewards, values, gamma=0.99, lam=0.95):
    gae, out = 0.0, []
    for t in reversed(range(len(rewards))):
        delta = rewards[t] + gamma * values[t + 1] - values[t]
        gae = delta + gamma * lam * gae
        out.append(gae)
    return out[::-1]
```

Tables, footnotes[^1], blockquotes, and images (`![alt](/img/thing.png)`) all work.

> Anything markdown-ish that you would write in Obsidian should come through fine.

[^1]: Footnotes come from the `extra` extension, which is on by default.
