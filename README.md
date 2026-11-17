# cropmark, web version

cropmark crops photos, draws on them and adds text. This repository is its browser
version: open a photo on the page, mark it up, download the result. The photo is
opened, edited and saved inside the browser tab. Nothing is uploaded.

It is the same editor as the desktop tool, compiled to WebAssembly. The desktop tool
and the core library live in a separate repository, included here as the submodule
`core/`.

This tool was built with Claude; the `-ai` suffix in the repository's name marks that.

> **Version 0.1.0. No compatibility promise before 1.0.** See [CHANGELOG.md](CHANGELOG.md).

## What it does

- **Open** a JPEG or PNG with the Open button, by dropping it on the page, or by pasting
  it from the clipboard. Phone photos stored sideways are turned upright.
- **Edit:** crop, freehand marker, highlighter, arrow, box, ellipse, and text with an
  optional outline, in eight colours. Undo and redo for every edit, including crops.
- **Save** with the Save button or `Ctrl+S`: the result is downloaded as
  `NAME-marked.png`, or `.jpg` if you pick JPEG in **Save as** on the page. **Save as**
  in the editor's toolbar (`Ctrl+Shift+S`) asks for another name.
- **Light and dark**, following the system setting; the button overrides it and is
  remembered.

## Privacy

- **Your photo never leaves the tab.** There is no server: the page is static files,
  and its Content-Security-Policy allows no connection to any other site.
- **A saved file carries less than the original.** The colour profile is kept and the
  orientation is applied to the pixels. All other EXIF data, including the GPS
  location, is dropped.
- The page stores one thing in the browser: your choice of light or dark, under the
  key `cropmark:theme`. No image data is stored.

## Shortcuts

Click the photo first, so the editor has the keyboard.

| Key | Action |
|---|---|
| `M` `H` `A` `B` `E` `C` `T` | Marker, Highlight, Arrow, Box, Ellipse, Crop, Text |
| `1` to `8` | Colour |
| `[` and `]` | Thinner, thicker (smaller, larger text) |
| `O` | Outline for text |
| `Enter` | Apply the crop; finish the text (`Shift+Enter`: new line) |
| `Esc` | Cancel what is in progress |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo |
| `Ctrl+S`, `Ctrl+Shift+S` | Save (download); save under another name |
| `Ctrl+O` | Open another photo |
| Mouse wheel | Zoom around the pointer |
| `Space`+drag, or middle-drag | Move the photo |
| `0` | Fit the photo to the window |

## Limits

- **JPEG and PNG, up to 32 megapixels.** A larger image is refused with a message. (The
  desktop tool takes 128 megapixels; a browser tab has less memory.) The photo must
  also fit in one GPU texture, commonly 8192 or 16384 pixels a side.
- **No picture picker.** The desktop tool's folder browser needs a real file system.
- **No sessions.** The desktop tool can save an edit as a `.pmark` file and reopen it;
  the web version cannot. The download is the only output, and an edit cannot be
  reopened.
- **Made for a desktop browser with a mouse.** Touch is not supported.
- **Save as in the toolbar changes the name, not the format.** The format is the
  **Save as** choice on the page.
- **One font,** DejaVu Sans, for text. Text is laid out left to right with simple
  kerning: no right-to-left scripts, ligatures or colour emoji.
- Committed edits cannot be selected or moved; use undo.

## Building

You need [Emscripten](https://emscripten.org) (`emcc`), `make`, and Node for the tests.

```sh
git submodule update --init     # fetch core/
make web                        # the site, in build/web/
make serve                      # build it and serve it at http://localhost:8000
make test                       # the core's tests, as WebAssembly, under Node
make browser-test               # the built site in headless Chrome
                                # (needs: npm install --no-save puppeteer-core)
```

## Publishing

`.github/workflows/pages.yml` runs the core's tests against the WebAssembly build,
builds the site with a pinned Emscripten version, checks it in a headless browser, and
on pushes to `main` deploys `build/web/` to GitHub Pages. One manual step is needed
once: in the repository, **Settings → Pages → Source: GitHub Actions**.

Every address in the site is relative, so it works unchanged under any repository name
or at the root of a domain. The page names no address of its own: the two footer links
come from the build (`make web REPO_URL=... AUTHOR_URL=...`), and a link without an
address is hidden. The workflow passes:

| Link | Address | To change it |
|---|---|---|
| Source | this repository on GitHub | follows the repository |
| William Mahaney | the Code page of the owner's site, `https://<owner>.github.io/code/` | set a repository variable `AUTHOR_URL`: Settings → Secrets and variables → Actions → Variables |

### The submodule

`core/` is pinned to one commit of the desktop repository. To move to a newer one:

```sh
git -C core fetch && git -C core checkout <commit>
git add core && git commit
```

If the desktop repository is renamed, update the address once:
`git submodule set-url core <new address>`, then commit `.gitmodules`.

## Custom domain

The site is published at the repository's `github.io` address. A custom domain is
optional and is set in **Settings → Pages**, not with a file: when Pages is published
by a GitHub Actions workflow, GitHub ignores a `CNAME` file, so this repository has
none. Nothing in the repository needs to change for any of the options below.

Custom domains work on every GitHub plan for a public repository; what GitHub Pro adds
is Pages for private repositories. GitHub does not supply the domain itself. It comes
from a registrar, from the GitHub Student Developer Pack (which includes a year of a
`.me` domain from Namecheap, among other registrar offers), or from a free subdomain
service such as is-a.dev.

There are three ways to use one. Pick one.

### A. A domain for the whole site; this tool follows

Give the user site, `wmahaney.github.io`, a custom domain, say `example.me`. Every
project site of the account that has no domain of its own then moves under it: this
one becomes `https://example.me/cropmark-ai/`, and its `github.io` address redirects
there. This is set up entirely in the website's repository, with GitHub's guide for an
apex or `www` domain.

Two things to do here afterwards, both optional:

- Set the repository variable `AUTHOR_URL` to `https://example.me/code/`, so the
  footer link names the new address. The old one keeps working through the redirect.
- Nothing for storage: the tool still shares a browser origin with the rest of the
  site, which is why its one stored key is prefixed, `cropmark:theme`.

### B. A subdomain of your own domain, for this tool alone

For example `cropmark.example.me`. The order matters: GitHub warns that pointing DNS at
Pages before the name is claimed lets another account take it.

1. **Verify the domain in your account.** Profile picture → Settings → Pages →
   **Add a domain** → `example.me`. GitHub shows a TXT record, with host
   `_github-pages-challenge-wmahaney.example.me` and a value. Add it at your DNS
   provider, wait for it (minutes, at most a day), and press **Verify**. Keep the record
   for good. Verifying a domain also protects its immediate subdomains.
2. **Claim the name for this repository.** This repository → Settings → Pages →
   Custom domain → `cropmark.example.me` → Save. The DNS check fails until step 3 is
   done; that is expected.
3. **Point the name at Pages.** At your DNS provider, add a `CNAME` record for
   `cropmark` with the value `wmahaney.github.io`. The value is the account's address,
   not the repository's. Do not use a wildcard record (`*.example.me`).
4. **Check it:** `dig cropmark.example.me +noall +answer` shows the CNAME.
5. **Enforce HTTPS** on the same settings page when it is offered, which can take up to
   a day.

The tool then has its own browser origin, separate from the rest of the site.

### C. A free subdomain from is-a.dev

is-a.dev is a volunteer-run service that hands out names such as
`cropmark-ai.is-a.dev`. A name is registered by a pull request to
[github.com/is-a-dev/register](https://github.com/is-a-dev/register). Their guide,
<https://docs.is-a.dev/guides/github-pages/>, has the current file format; follow it
if it differs from this.

1. **Start the verification in your account.** Profile picture → Settings → Pages →
   **Add a domain** → `cropmark-ai.is-a.dev`. GitHub shows a TXT record, with host
   `_github-pages-challenge-wmahaney.cropmark-ai.is-a.dev` and a value. Leave the page
   open.
2. **Claim the name for this repository:** Settings → Pages → Custom domain →
   `cropmark-ai.is-a.dev` → Save. The DNS check fails until the pull request is merged.
3. **Request the name.** Fork `is-a-dev/register` and add `domains/cropmark-ai.json`:

   ```json
   {
     "owner": { "username": "wmahaney" },
     "records": { "CNAME": "wmahaney.github.io" }
   }
   ```

   is-a.dev does not allow a TXT record in the same file as a CNAME, so the TXT record
   goes in a second file named after its host,
   `domains/_github-pages-challenge-wmahaney.cropmark-ai.json`, with the same `owner`
   and `"records": { "TXT": "<the value from GitHub>" }`.
4. Open the pull request and wait for it to be merged.
5. Back on the page from step 1, press **Verify**.
6. **Enforce HTTPS** in this repository's Pages settings when it is offered.

### Whichever you choose

- The `github.io` address stays the fallback: remove the custom domain in Settings →
  Pages and the site is served there again.
- If this site is ever taken down while a DNS record still points at GitHub, someone
  else could serve a page under that name. Verification (step 1 of B and C) prevents
  that; if the domain is not verified, delete the DNS record first.

## Layout

```
core/               the desktop repository (submodule): the editor and the core library
web/                the page: index.html, style.css, app.js, theme.js, and picker_stub.c
tests/              the browser check and its golden image
third_party/        the DejaVu Sans font and the license notices
docs/               ARCHITECTURE.md
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers the route taken, what was changed
in the desktop repository, the limits a browser imposes, and the security policy.

## License

cropmark is dedicated to the public domain under [CC0 1.0](LICENSE). The font and the
libraries it is built with keep their own licenses; see
[third_party/NOTICE.txt](third_party/NOTICE.txt).
