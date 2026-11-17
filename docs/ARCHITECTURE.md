# cropmark web version: architecture

The web version (0.1.0) is cropmark's desktop editor running in a browser tab from
static files. This document records the route taken, what had to change in the desktop
repository, the limits a browser imposes, and how the page is kept idle and closed to
the network.

## 1. Constraints

1. **Static only.** GitHub Pages serves files. There is no backend and no upload:
   photos are decoded, edited and encoded inside the tab.
2. **No third-party requests.** Everything is vendored and same-origin.
3. **Public repository.** No secrets, no personal photos; fixtures are the core's
   synthetic test images.
4. **Single-threaded WebAssembly.** Pages cannot send the COOP/COEP headers that threads
   and `SharedArrayBuffer` need.
5. **Light on the visitor's machine.** The editor draws only when something changes.
6. **Small.** The deployed site is 1.8 MB; the limit is 10 MB.

## 2. The route: the SDL2 editor, ported (Route A)

Two routes were open: compile the desktop editor (`core/gui/gui.c`) with Emscripten's
SDL2 port, or export an API from the core and write a new canvas front end in
JavaScript. **The first was taken.**

Why it was not fragile:

- The editor is one window with one state structure, and its loop already waits for
  events and draws once per batch. Nothing in it assumes it owns the thread.
- It draws through SDL's 2D renderer only, which Emscripten's SDL2 port implements on
  WebGL.
- The core has no dependency on SDL, threads or the network.

What it buys: the web editor *is* the desktop editor. Same toolbar, shortcuts and status
bar, and the same pixels, because the same C code produces them. The browser check
proves the last point: a crop and a stroke made with the mouse in the page give a PNG
identical, pixel for pixel, to the command-line tool's for the same edit.

A new JavaScript front end would have been a second editor to keep in step.

## 3. Layering

```
  web/index.html + app.js           the page: file chooser, drop, paste, download,
        |                           theme, waking the editor
        v
  cropmark.js / cropmark.wasm       built by this repository's Makefile from:
  +--------------------------------------------------------------+
  | core/gui/gui.c        the editor, with its "web" section      |
  | web/picker_stub.c     the picker, absent                      |
  | core/src/pm_*.c       the core (libpmark)                     |
  | SDL2                  Emscripten's port                       |
  +--------------------------------------------------------------+
```

`core/` is a git submodule: the desktop repository at a pinned commit. A copy would
drift, and GitHub does not let an account fork its own repository.

## 4. What changed in the desktop repository

One commit on its `web-support` branch. The desktop program, its tests and its output
are unchanged (`make test`, `make asan` and `make fuzz-smoke` pass there).

| Change | Where | Effect on the desktop |
|---|---|---|
| A `web` section: `cm_web_open`, `cm_web_wake`, `cm_web_set_palette`, `cm_web_set_format`, `cm_web_modified`, `cm_web_strerror`, `cm_web_view`, and the loop `web_frame` | end of `gui/gui.c`, inside `#ifdef __EMSCRIPTEN__` | none: not compiled |
| Open goes through `request_open`, which calls the picker on the desktop and the page in the browser | `gui/gui.c` | none |
| A save calls `Module.cmSaved` | `save()` in `gui/gui.c`, inside `#ifdef __EMSCRIPTEN__` | none |
| The toolbar's colours are one table (`ui`), initialised to the desktop colours | `gui/gui.c` | none: same values |
| The window's state is a file-scope variable instead of a local static | `gui/gui.c` | none |
| `#ifndef PM_MAX_PIXELS` around the size limit | `include/pmark.h` | none: default unchanged |
| The hard-link check in the unit tests is skipped under Emscripten | `tests/test_core.c` | none |

**Merge order.** The submodule here points at that commit, so it must exist on GitHub
before this repository's workflow can check it out:

1. the rename pull request of the desktop repository (the rename itself comes first);
2. the `web-support` pull request of the desktop repository, which is stacked on it;
3. this repository's `v0.1` into `main`.

## 5. How the page and the editor talk

| Direction | Call | When |
|---|---|---|
| page → editor | `cm_web_open(path)` | a photo was chosen, dropped or pasted; its bytes were written to `/work/NAME` in Emscripten's in-memory file system |
| page → editor | `cm_web_set_format(0 or 1)` | the **Save as** choice (PNG or JPEG) |
| page → editor | `cm_web_set_palette(...)` | at start and when the theme changes |
| page → editor | `cm_web_wake()` | any input on the canvas, a resize |
| page → editor | `cm_web_modified()` | before the tab closes, and before another photo replaces this one |
| editor → page | `Module.cmOpenRequested()` | Open in the toolbar, `Ctrl+O` |
| editor → page | `Module.cmSaved(path)` | a save succeeded: the page reads the file, starts a download, deletes the file |

**Opening.** The decoders are the core's own: the bytes go through the same
header-checked, fuzz-tested parsers as on the desktop. There is no second decoding
path, and the browser's image decoder is not used. Once decoded, the input file is
deleted from the in-memory file system; opening another photo closes the previous
document, which frees its pixels and its undo history.

**Saving.** The editor writes the output as it does on the desktop (a temporary file,
then a rename), and the page turns the file into a download. The default name is the
photo's name with `-marked.png`.

**The font.** A browser has no system fonts a C program can read. The page fetches
`font/DejaVuSans.ttf` (the desktop default), writes it to `/font/` in the in-memory file
system, and sets `PMARK_FONT`, which the core already honours.

**The canvas size.** The page sizes the canvas with CSS. SDL follows a CSS-sized canvas
on window resizes; when the canvas changes size for another reason (a message, the
shortcut list), the page sends the same resize event.

## 6. Idle means idle

The desktop loop sleeps in `SDL_WaitEventTimeout`. A browser has no blocking wait, so
`web_frame` runs from `requestAnimationFrame`, and:

- it drains SDL's event queue and draws once if there was anything;
- if a frame had no event (and no timed status message is showing), it calls
  `emscripten_pause_main_loop`, and no further frame is requested;
- the page calls `cm_web_wake` on mouse, wheel, keyboard and focus events on the canvas
  and on resize, which resumes the loop.

So with a photo open and the mouse still there is no recurring work: the browser check
counts animation frames and timers over 2.5 seconds and requires zero. A hidden tab
gets no animation frames at all. A timed status message ("Saved ...") keeps the loop
polling, without drawing, until it runs out.

The editor module itself (0.2 MB of JavaScript, 0.8 MB of WebAssembly) and the font
(0.8 MB) are fetched when the first photo is opened, not on page load.

## 7. Limits of the web version

- **32 megapixels** (`-DPM_MAX_PIXELS`), against 128 on the desktop: 32 MP is 128 MB per
  RGBA copy, and the editor holds more than one. A larger image is refused from its
  header, before any pixel is decoded, with a message on the page.
- **Memory** grows on demand up to 2 GB. The build keeps Emscripten's default for
  growable memory, where `malloc` returns NULL when no more can be had; the core turns
  that into `PM_ERR_NOMEM`, which the page shows as a message. (This path was not
  exercised with a real photo near the limit.)
- **No picker.** `web/picker_stub.c` stands in for `core/gui/picker.c`, which needs
  POSIX folder listing and a thread.
- **No sessions.** A `.pmark` file refers to the photo by path, which means little in a
  browser. Sessions are switched off in `cm_web_open`.
- **Metadata** follows the desktop rules, since it is the same code: colour profile
  kept, orientation applied, other EXIF including GPS dropped.
- **Mouse and keyboard.** Touch input is not handled.

## 8. Security

The page carries this policy in a `<meta>` tag:

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval';
connect-src 'self';
img-src 'self' blob: data:;
style-src 'self';
base-uri 'none'; form-action 'none'
```

- `connect-src 'self'` is what fetches the `.wasm` and the font, and it is also the
  guarantee behind "your photo never leaves this tab": the page cannot open a
  connection to any other site.
- `script-src`: no inline script and no `eval`. `'wasm-unsafe-eval'` lets the browser
  compile the module. The build uses `-sDYNAMIC_EXECUTION=0`, so the Emscripten runtime
  contains no `eval`.
- **One addition to the brief's list: `style-src 'self'`.** With `default-src 'none'` the
  page's own stylesheet would otherwise be refused. It is not a loosening forced by
  Emscripten: nothing needs inline styles, and none are allowed.
- The Emscripten runtime needed no other loosening. The browser check fails on any
  policy violation.

The keyboard: SDL listens on the canvas only (`SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT`),
so shortcuts apply while the editor has the focus. The page cancels the browser's own
action for `Ctrl+S`, `Ctrl+O`, `Ctrl+Z` and `Ctrl+Y` there, so `Ctrl+S` downloads the
picture instead of saving the web page.

Storage: one key, `cropmark:theme`. Until the site has its own domain it shares one
storage origin with everything under `wmahaney.github.io`, hence the prefix. No image
data is ever stored.

## 9. Look

The colours are those of the owner's site, https://wmahaney.github.io, taken from its
theme files as they are.

| Property | Light | Dark | Source in `wmahaney/wmahaney.github.io` |
|---|---|---|---|
| `--bg` | `#FBF5E6` | `#15171C` | `--wm-bg` in `assets/theme-light.scss`, `assets/theme-dark.scss` |
| `--panel` | `#FFFDF7` | `#1E2128` | `--wm-surface`, same files |
| `--text` | `#1E2430` | `#F2EDE0` | `--wm-ink` |
| `--muted` | `#4A5160` | `#B3B8C5` | `--wm-muted` |
| `--border` | `#E3D8BA` | `#343947` | `--wm-line` |
| `--accent` | `#2B4FB8` | `#9DB3F7` | `--wm-accent` |
| `--accent-text` | `#FFFFFF` | `#15171C` | `--wm-accent-ink` |
| `--danger` | `#B93A2B` | `#F08D7C` | `--wm-red` (error messages) |

The editor draws its own toolbar on the canvas, so the page passes it the same values
(`cm_web_set_palette`): `--bg` around the photo, `--panel` for the two bars, `--border`
for buttons, `--accent` for the selected button with `--accent-text` on it, `--text`,
`--muted` for disabled labels. The desktop default is untouched.

System UI font stack for the page; the page's toolbar is 44 px and its status bar 28
px, with 6 px corners and no shadows. The editor's own toolbar and status bar keep
their desktop sizes (40 and 28 px). Its labels are drawn in DejaVu Sans, the one font
the editor has.

## 10. Tests

| Test | What it covers |
|---|---|
| `make test` | The core's own `tests/test_core.c` (140 checks; the two hard-link checks do not apply), its command-line smoke test and its golden images, compiled to WebAssembly and run under Node. A miscompile that only the web build has would show here. |
| `tests/browser/check.mjs` | The built site in headless Chrome: nothing but the page is fetched until a photo is opened; a 40-megapixel image is refused; a sideways JPEG opens upright; a crop and a marker stroke made with the mouse, saved with `Ctrl+S`, give a PNG identical to the command-line tool's for the same edit and to `tests/golden/crop-stroke.png`; the JPEG choice likewise; every tool and outlined text; undo and redo across the crop; drop and paste; the theme; zero frames while idle; no request to another origin; no policy violation. |
| In the desktop repository | `make test`, `make asan`, `make fuzz-smoke` on the `web-support` branch. |

The test programs are linked with one file the site does not have,
`tests/node_umask.c`. Emscripten starts a program with a umask of 0777, a placeholder,
and the core gives a file it writes the mode `0666 & ~umask`: mode 000. Under Node with
real files, only root can read such a file back, so the tests passed for root and
failed for anyone else. The file sets the umask of the Node process when a test program
starts. The page does not need it: it sets the mode of a saved file itself before
reading it (section 5, `web/app.js`).

## 11. Build and deploy

One Makefile: `make web`, `make test`, `make browser-test`, `make serve`. The workflow
checks out the submodule, installs a pinned Emscripten, runs the tests, builds, checks
the size, runs the browser check, and on `main` deploys. Every action is pinned to a
commit; the workflow has `contents: read`, and only the deploy job has `pages: write`
and `id-token: write`.

**Emscripten is pinned to 3.1.6,** the version this release was built and tested with.
Its SDL2 port is SDL 2.0.20. To move to a newer release, change `EMSDK_VERSION` in the
workflow, push a branch, and let the tests decide.

### Building with a distribution's Emscripten

Ubuntu 24.04 packages Emscripten 3.1.6 together with LLVM 15, a pairing the Emscripten
project did not ship. Two things differ from an `emsdk` install, and both were worked
around while developing this release, outside the repository:

- A program whose `main` takes `argc` and `argv` links to nothing, because that LLVM
  names it `__main_argc_argv` and that Emscripten does not know the name. The site is
  not affected (it has no `main`). The test programs are: pass a one-function file
  that exports it as `main` through `make test EMTEST_EXTRA=file.c`.
- The packaged cache is read-only, so the SDL2 port cannot be built into it: point
  `EM_CONFIG` at a copy of the configuration with `FROZEN_CACHE = False` and `EM_CACHE`
  at a writable directory.

With `emsdk`, neither applies and `EMTEST_EXTRA` stays empty.

## 12. Not implemented

Absent by design in 0.1; each is a limit stated in the README, not a plan.

- The folder picker and sessions (section 7).
- Touch input and a layout for phones.
- A service worker: the page needs the network on first load and on the first photo.
- Any upload, sharing or account feature: there is no backend.
