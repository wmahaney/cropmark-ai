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
- **Copy** with `Ctrl+C`, or right-click the picture and pick **Copy picture**: the
  picture, with every edit so far, goes to the clipboard as a PNG, ready to paste into
  a chat, a document or another program. A copy is not a save: the edits still count
  as unsaved.
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
| `Ctrl+C`, or right-click | Copy the picture to the clipboard |
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

## Address

The site is served at GitHub's default address for the repository,
`https://<owner>.github.io/<repository>/`. No custom domain is configured, and the
repository has no `CNAME` file.

If one is added later, nothing here needs to change. Every address in the site is
relative, and when Pages is published by a GitHub Actions workflow the domain is set in
**Settings → Pages**, not with a file. Follow GitHub's guide,
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site>,
and verify the domain in your account before pointing DNS at GitHub, so that no one
else can claim the name.

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
