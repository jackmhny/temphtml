# temphtml

An agent scrapyard for small static projects, temporary write-ups, and experiments.
GitHub Pages publishes `main` at <https://jackmhny.github.io/temphtml/>.

## Layout

```text
index.html       public artifact inbox
style.css        shared scrapyard/write-up styles
assets/          640×400 public page thumbnails
stardoku/        pinned standalone project
misc-htmls/      public temporary write-ups
locked/          optional encrypted output only
private-src/     ignored local plaintext; never commit
```

## Public page or project

1. Put a small write-up in `misc-htmls/<slug>.html`, or a standalone project in
   `<slug>/index.html`.
2. Reuse `../style.css` for write-ups. A standalone project may keep its own CSS.
3. Capture a 640×400 screenshot:

   ```bash
   firefox --headless --window-size 640,400 \
     --screenshot assets/<slug>.png \
     http://127.0.0.1:8765/<path>/
   ```

4. Add one `.mail-card` to `index.html` with:

   - a subject;
   - an exactly 80-character plain-text description;
   - the page screenshot as its thumbnail.

5. Use a normal 72 px row for an artifact. A pinned project uses
   `.pinned-card`, which is 108 px tall with a thumbnail scaled by the same
   1.5× ratio.
6. Do not render an `… more` control until there are more than ten unpinned
   artifacts. At that point, keep the ten newest on the front page and move
   older entries into an archive page or folder.

## Private notes: the choices

GitHub Pages serves static files. Making a repository private does not by itself
make a personal Pages site private. GitHub's own Pages access control is for
private/internal project sites owned by an organization on GitHub Enterprise
Cloud. A JavaScript password comparison, hidden URL, robots file, or unlisted
folder is not access control.

### Best privacy: Tailscale Serve

For notes that should never be downloadable from the public internet, keep them
outside this repository and serve the directory only inside the tailnet:

```bash
mkdir -p /home/jackmhny/private-temphtml
tailscale serve --bg /home/jackmhny/private-temphtml
tailscale serve status
```

If Tailscale requires root, use the workstation's graphical askpass flow:

```bash
SUDO_ASKPASS=/usr/bin/ssh-askpass sudo -A \
  tailscale serve --bg /home/jackmhny/private-temphtml
```

This is real network access control and HTTPS, with the tailnet policy deciding
who can connect. Use `tailscale serve off` to stop it. Do not use Tailscale
Funnel; Funnel is public.

Reference: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

### Best public-URL compromise: StatiCrypt + 1Password

When a note needs a normal GitHub Pages URL, encrypt the entire self-contained
HTML file locally and commit only the encrypted result. The ciphertext remains
public and can be attacked offline, so use a unique 24+ character generated
password saved in 1Password.

Keep the source outside the repo or under ignored `private-src/`:

```bash
mkdir -p /home/jackmhny/private-temphtml/example
# Create /home/jackmhny/private-temphtml/example/index.html.

cd /home/jackmhny/temphtml
npx staticrypt@3.5.4 \
  /home/jackmhny/private-temphtml/example/index.html \
  --directory locked/example \
  --remember 7 \
  --template-title "private note"
```

Let StatiCrypt prompt for the password. Do not put it in the command, chat,
repository, `.env`, or shell history. Saving the exact Pages URL as a 1Password
Login lets the browser extension fill its password field. `--remember 7` makes
the browser remember the unlock for seven days; this is convenient but means
browser-profile compromise can unlock the page.

Important limits:

- Never commit the plaintext even briefly; Git history retains it.
- Keep secret images and CSS inline. StatiCrypt encrypts HTML, while separately
  published assets remain public.
- Do not add the private page to the public inbox unless leaking its title and
  existence is acceptable.
- Do not use StatiCrypt share URLs; the URL fragment acts as an unlock secret.
- Anyone can download the ciphertext and guess passwords offline. This is
  encryption, not user authentication, revocation, or an audit log.
- `.staticrypt.json` contains a salt, not the password, and may be committed so
  remembered unlocks survive rebuilds.

Reference: [StatiCrypt v3](https://github.com/robinmoisson/staticrypt).

### Passkeys

1Password can save and use a passkey after a website implements WebAuthn.
WebAuthn requires a relying-party server to generate a random challenge, store
credential public keys, verify the signed assertion, and authorize the response.
GitHub Pages cannot run that server.

A passkey version therefore means moving the private route behind a small
serverless function or authentication proxy. That is reasonable for multiple
users, per-user revocation, and auditability, but it is more machinery than a
personal note needs. Prefer Tailscale Serve for true private access or
StatiCrypt plus 1Password for an encrypted public blob.

References:
[1Password passkeys](https://support.1password.com/save-use-passkeys/),
[WebAuthn relying parties](https://www.w3.org/TR/webauthn/#sctn-rp-operations),
[GitHub Pages visibility](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site).

## Style guide

- Keep the Coconut-derived palette: white, `#111`, `#666`, and `#f2f2f2`.
- Use Arial/Helvetica, square corners, heavy black rules, and compact lowercase
  subjects. Avoid gradients, shadows, badges, decorative metadata, and filler.
- Keep the page at `860px` maximum width with `18px` horizontal padding.
- The home page is an inbox, not a dashboard: thumbnail, subject, one-line
  preview. Descriptions stay at exactly 80 characters and truncate on narrow
  screens.
- Write-ups use `.crumbs`, `.article-header`, `.dek`, `article`, `.note`, and
  `.page-footer` from the shared stylesheet.
- Keep temporary artifacts visually smaller than pinned projects.

## Validate and publish

Run a local server and check every changed route:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
node --check stardoku/app.js
git diff --check
```

Inspect desktop and 390 px mobile screenshots, stage only intended files, commit,
and push `main`. Confirm the GitHub Pages build contains the pushed commit and
that every public route returns HTTP 200.
