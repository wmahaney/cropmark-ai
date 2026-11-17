# Changelog

The web version of cropmark is **pre-1.0**. Until 1.0 there is no compatibility
promise: any release may change the page and what it remembers in the browser.

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
