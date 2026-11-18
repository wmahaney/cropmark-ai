# Changelog

The web version of cropmark is **pre-1.0**. Until 1.0 there is no compatibility
promise: any release may change the page and what it remembers in the browser.

## Unreleased

- **Undo and redo from anywhere on the page.** `Ctrl+Z`, `Ctrl+Y` and `Ctrl+Shift+Z`
  used to work only while the picture had the keyboard; after clicking a button on the
  page, or the page itself, they did nothing. The page now passes them to the editor
  (`cm_web_history`).
- **Undo and redo while typing text.** They used to be ignored while typing. Now the
  text is finished first, so undo takes it away and redo brings it back. The editor's
  Undo button no longer throws the typed text away together with the edit before it.
- `core/` points at the desktop repository's `web-undo` branch, which adds both.
- The browser check covers undo and redo with the focus on a page button and on the
  page, and while typing (44 checks).
- **Copy:** `Ctrl+C` in the editor, or **Copy picture** in the menu that right-clicking
  the picture now opens, puts the picture on the clipboard as a PNG, with every
  committed edit (not one still in progress). It is not a save: the edits stay unsaved
  and the page still warns before closing. Always PNG, whatever **Save as** says. The
  editor's status bar says when the copy is done; a browser without the Clipboard API
  gets a message instead.
- `core/` points at the desktop repository's `web-copy` branch, which adds
  `cm_web_copy` and `cm_web_status`.
- The browser check covers copying: Ctrl+C, the menu, Esc, that a copy is not a save,
  and that the copied PNG equals the saved one (40 checks).
- The author link in the footer no longer has an address written into the page. Like
  the "Source" link, it comes from the build (`AUTHOR_URL`); the workflow points it at
  the owner's Code page, and a repository variable `AUTHOR_URL` can replace that. A
  link without an address is hidden, and only `http` and `https` addresses are used.
- The browser check also tests that the page's own files name no address and that the
  footer links are the build's (31 checks).
- `core/` now points at the desktop repository's `main` (`e45ac0e`, the merge of its
  `web-support` branch). The files are the same as before.
- The site stays at GitHub's default address. The README no longer describes a
  planned is-a.dev subdomain; it notes what to do if a custom domain is added later.

## 0.1.0 (2026-11-16)

- cropmark's desktop editor, compiled to WebAssembly, on a page: open a photo with the
  file chooser, by dropping it on the page or by pasting it; crop, marker, highlighter,
  arrow, box, ellipse, text with an outline, undo and redo; save as a download, PNG or
  JPEG.
- The photo is decoded, edited and encoded in the tab. Nothing is uploaded, and the
  page's policy allows no connection to another site.
- A saved file keeps the colour profile and is upright; other EXIF data, including GPS
  location, is dropped.
- Images up to 32 megapixels; a larger one is refused with a message.
- Light and dark themes, also for the editor's own toolbar.
- The editor does no work while nothing happens: its loop pauses until the next input.
- Tests: the core's unit tests, command-line smoke test and golden images run against
  the WebAssembly build under Node; a headless-browser check edits a photo with the
  mouse and compares the download with the command-line tool's result.
- GitHub Actions workflow that builds with Emscripten and deploys to GitHub Pages.
