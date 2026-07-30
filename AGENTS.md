# AGENTS.md

These instructions apply to the entire repository.

## Read first

- Read `README.md` before changing structure or publishing a page.
- Preserve unrelated user changes. Stage explicit paths.
- This repository deploys directly from `main` through GitHub Pages.

## Public artifacts

- Put temporary write-ups in `misc-htmls/`; put standalone projects in their own
  top-level folder.
- Reuse the shared Coconut-derived style for write-ups.
- Add public entries to the homepage as email-like `.mail-card` rows.
- Every row needs a real 640×400 screenshot, a short subject, and an exactly
  80-character description.
- Normal artifacts are 72 px tall. Pinned entries use `.pinned-card` and remain
  exactly 1.5× larger.
- Show no `… more` control with ten or fewer unpinned artifacts. Above ten, keep
  the ten newest visible and archive the rest.
- Prefer removing copy and ornament over adding metadata, badges, explanations,
  or decorative UI.

## Style

- White background; `#111` ink/rules; `#666` muted text; `#f2f2f2` shade.
- Arial/Helvetica, square corners, no gradients, shadows, pills, or ornamental
  status text.
- Maximum content width `860px`; mobile must work at `390px`.
- Keep prose direct. Avoid UI slop.

## Validation and publishing

- Parse changed HTML, check CSS brace balance, run `git diff --check`, and test
  all changed URLs through a local HTTP server.
- Inspect desktop and mobile screenshots for layout changes.
- Push the intended commit to `main`, wait for GitHub Pages to deploy that exact
  SHA, and confirm public routes and assets return HTTP 200.
