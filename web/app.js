// cropmark, web version: the page around the editor.
//
// The editor itself is the desktop editor (core/gui/gui.c) compiled to WebAssembly; it
// draws its own toolbar and status bar on the canvas. This file does what a browser
// tab needs around it:
//   - gets a photo (file chooser, drag and drop, paste) and hands its bytes to the
//     editor through Emscripten's in-memory file system;
//   - turns a save into a download;
//   - passes the page's colours to the editor's toolbar;
//   - wakes the editor's loop on input, so it does no work while nothing happens.
//
// Nothing is loaded until the first photo is opened, and nothing is ever sent anywhere:
// the page's policy (in index.html) allows no connection to another site.
"use strict";

(() => {
  const KEY = "cropmark:";              // every localStorage key of this page starts with this
  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas"), stage = $("stage"), start = $("start"), message = $("message");

  let editor = null;                    // the WebAssembly module, once loaded
  let editorPromise = null;
  let hasPhoto = false;

  function say(text, plain = false) {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle("plain", plain);
  }

  // ---- loading the editor, on the first photo --------------------------------------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(s);
    });
  }

  function loadEditor() {
    if (!editorPromise) {
      editorPromise = (async () => {
        await loadScript("cropmark.js");
        const [mod, font] = await Promise.all([
          window.createCropmark({
            canvas,
            print: () => {},
            printErr: () => {},
            // The editor asks for these two things; see the "web" section of gui.c.
            cmOpenRequested: () => chooseFile(),
            cmSaved: (path) => saved(path),
            // The font the editor uses for text and for its labels (there are no
            // system fonts to read in a browser).
            preRun: [(m) => { m.ENV.PMARK_FONT = "/font/DejaVuSans.ttf"; }],
          }),
          fetch("font/DejaVuSans.ttf").then((r) => { if (!r.ok) throw new Error("could not load the font"); return r.arrayBuffer(); }),
        ]);
        mod.FS.mkdir("/font");
        mod.FS.writeFile("/font/DejaVuSans.ttf", new Uint8Array(font));
        mod.FS.mkdir("/work");
        mod.FS.chdir("/work");
        editor = mod;
        return mod;
      })().catch((e) => { editorPromise = null; throw e; });
    }
    return editorPromise;
  }

  // ---- opening a photo -------------------------------------------------------------
  function chooseFile() {
    $("file").click();
  }

  // A file name the editor can use: the output is named after it (photo.jpg ->
  // photo-marked.png), so keep it recognisable and free of path characters.
  function safeName(name, bytes) {
    let stem = String(name || "").replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "")
      .replace(/[^\p{L}\p{N}._ -]+/gu, "_").trim().slice(0, 80);
    if (!stem || /^\.+$/.test(stem)) stem = "photo";
    const png = bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    return stem + (png ? ".png" : ".jpg");
  }

  let opening = false;
  async function openFile(file) {
    if (!file || opening) return;
    if (editor && editor._cm_web_modified() &&
        !window.confirm("Open another photo? The edits to this one have not been saved.")) return;
    opening = true;
    say("");                            // before the window is made: the layout must be final
    document.body.classList.add("busy");
    try {
      const [mod, buffer] = await Promise.all([loadEditor(), file.arrayBuffer()]);
      const bytes = new Uint8Array(buffer);
      const path = "/work/" + safeName(file.name, bytes);
      for (const old of mod.FS.readdir("/work")) if (old !== "." && old !== "..") mod.FS.unlink("/work/" + old);
      mod.FS.writeFile(path, bytes);
      // The canvas must be on the page, at its size, before the editor makes its window.
      start.hidden = true;
      stage.hidden = false;
      sendPalette();
      const rc = mod.ccall("cm_web_open", "number", ["string"], [path]);
      mod.FS.unlink(path);                // decoded; the editor keeps pixels, not the file
      if (rc !== 0) {
        if (!hasPhoto) { stage.hidden = true; start.hidden = false; }
        let why = mod.UTF8ToString(mod._cm_web_strerror(rc));
        if (/too large/.test(why)) why += ": the web version takes photos up to 32 megapixels";
        say("Could not open " + (file.name || "that file") + ": " + why + ".");
        return;
      }
      hasPhoto = true;
      sendFormat();
      sendPalette();
      say("");
      canvas.focus();
    } catch (e) {
      if (!hasPhoto) { stage.hidden = true; start.hidden = false; }
      say("Could not open the photo: " + (e && e.message ? e.message : e) + ".");
    } finally {
      opening = false;
      document.body.classList.remove("busy");
    }
  }

  // ---- saving: the editor wrote a file; make it a download -----------------------------
  function saved(path) {
    // The core creates the file through mkstemp and then gives it the usual
    // permissions less the umask; Emscripten's umask leaves it unreadable. Make it
    // readable before taking its bytes.
    editor.FS.chmod(path, 0o600);
    const data = editor.FS.readFile(path);
    editor.FS.unlink(path);
    const name = path.replace(/^.*\//, "");
    const type = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sendFormat() {
    if (editor && hasPhoto) editor._cm_web_set_format($("format").value === "jpeg" ? 1 : 0);
  }

  // ---- colours: the page's palette, for the editor's own toolbar ----------------------
  function colour(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : 0;
  }
  function sendPalette() {
    if (!editor) return;
    // around the photo, bars, button, selected button, text, text on the selected
    // button, disabled text, prompt text
    editor._cm_web_set_palette(colour("--bg"), colour("--panel"), colour("--border"), colour("--accent"),
      colour("--text"), colour("--accent-text"), colour("--muted"), colour("--accent"));
  }

  const store = {
    get(name) { try { return localStorage.getItem(KEY + name); } catch { return null; } },
    set(name, value) { try { localStorage.setItem(KEY + name, value); } catch { /* not remembered */ } },
  };
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() {
    const chosen = document.documentElement.dataset.theme;
    return chosen ? chosen === "dark" : darkQuery.matches;
  }
  function showTheme() {
    const btn = $("btn-theme");
    btn.textContent = isDark() ? "Light" : "Dark";
    btn.setAttribute("aria-label", isDark() ? "Switch to the light theme" : "Switch to the dark theme");
    sendPalette();
  }

  // ---- wiring ----------------------------------------------------------------------
  $("btn-open").addEventListener("click", chooseFile);
  $("file").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    ev.target.value = "";
    openFile(file);
  });
  $("format").addEventListener("change", () => { sendFormat(); canvas.focus(); });
  $("btn-theme").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);         // the one thing this page remembers
    showTheme();
  });
  darkQuery.addEventListener("change", showTheme);
  $("btn-keys").addEventListener("click", () => {
    const panel = $("keys"), open = panel.hidden;
    panel.hidden = !open;
    $("btn-keys").setAttribute("aria-expanded", String(open));
    wake();                             // the canvas changed size
  });

  // Drag and drop anywhere on the page, and paste.
  let dragDepth = 0;
  window.addEventListener("dragenter", (ev) => { ev.preventDefault(); if (++dragDepth === 1) document.body.classList.add("dragging"); });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  window.addEventListener("dragover", (ev) => ev.preventDefault());
  window.addEventListener("drop", (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("dragging");
    openFile(ev.dataTransfer && ev.dataTransfer.files[0]);
  });
  document.addEventListener("paste", (ev) => {
    const file = [...(ev.clipboardData ? ev.clipboardData.files : [])].find((f) => /^image\//.test(f.type));
    if (file) { ev.preventDefault(); openFile(file); }
  });

  // The editor's loop pauses itself when a frame had nothing to do. Any input wakes it.
  function wake() { if (editor) editor._cm_web_wake(); }
  // The editor follows the size of its canvas when the window is resized. When the
  // canvas changes size for another reason (a message appears, the shortcut list
  // opens), tell it the same way.
  let lastSize = "";
  new ResizeObserver(() => {
    const size = canvas.clientWidth + "x" + canvas.clientHeight;
    if (size === lastSize || stage.hidden) return;
    lastSize = size;
    window.dispatchEvent(new Event("resize"));
  }).observe(stage);
  for (const type of ["mousedown", "mouseup", "mousemove", "wheel", "keydown", "keyup", "focus", "blur", "mouseenter", "mouseleave"]) {
    canvas.addEventListener(type, wake, { passive: true });
  }
  window.addEventListener("mouseup", wake);
  window.addEventListener("resize", wake);
  document.addEventListener("visibilitychange", wake);

  // While the editor has the keyboard, its shortcuts win over the browser's: Ctrl+S
  // saves the picture, not the web page.
  canvas.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ["s", "o", "z", "y"].includes(ev.key.toLowerCase())) ev.preventDefault();
  });
  canvas.addEventListener("mousedown", () => canvas.focus());
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

  window.addEventListener("beforeunload", (ev) => {
    if (editor && editor._cm_web_modified()) { ev.preventDefault(); ev.returnValue = ""; }
  });

  // The footer links, for the addresses the build was given (see config.js). Only
  // http and https addresses are used; a link without one stays hidden.
  for (const [id, url] of [["source", window.CROPMARK_SOURCE], ["author", window.CROPMARK_AUTHOR]]) {
    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      $(id).href = url;
      $(id).hidden = false;
    }
  }
  showTheme();
})();
