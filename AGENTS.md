# AGENTS.md

These instructions apply to the entire repository.

## Read first

- Read `README.md` before changing structure, publishing a page, or handling
  private content.
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

## Private artifacts

- Decide the privacy model before writing the page:
  - use Tailscale Serve for genuinely private, tailnet-only pages;
  - use StatiCrypt for password-encrypted ciphertext on public GitHub Pages;
  - use a backend/serverless relying party if real passkey authentication is
    required.
- Never implement a fake client-side login that compares a password in
  JavaScript or contains a password, hash, decryption key, allowlist, or passkey
  verification secret in the public repository.
- Never commit plaintext private content, even temporarily. Use
  `/home/jackmhny/private-temphtml/` or ignored `private-src/`.
- Never ask the user to paste a private-page password into chat. Use StatiCrypt's
  interactive prompt so it does not enter shell history.
- Commit only encrypted output under `locked/`. Inline secret assets before
  encryption; separately hosted files are public.
- Do not list a private page on the public index or capture an unlocked thumbnail
  unless the user explicitly accepts that metadata/content leak.
- Do not claim that a passkey is supported by a static page alone. WebAuthn
  requires server-side challenge generation and verification.

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
- Verify no plaintext private material or credential entered the diff or Git
  history.
- Push the intended commit to `main`, wait for GitHub Pages to deploy that exact
  SHA, and confirm public routes and assets return HTTP 200.
