# Changelog

The web version of cropmark is **pre-1.0**. Until 1.0 there is no compatibility
promise: any release may change the page and what it remembers in the browser.

## Unreleased

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
