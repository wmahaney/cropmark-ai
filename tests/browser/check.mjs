// A headless-browser check of the built site.
//     node tests/browser/check.mjs build/web
// Needs Node 18+, Chrome or Chromium, the package puppeteer-core
// (npm install --no-save puppeteer-core), and the WebAssembly test programs
// (make build/test/bin/cropmark build/test/bin/imgdiff; "make browser-test" does it all).
// Set CHROME to the browser's path if it is not found.
//
// It opens a fixture photo in the page, crops it and draws a stroke with the mouse,
// saves, and compares the download with (1) the same edit made by the command-line
// tool and (2) a stored golden image.
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, mkdtempSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, "../..");
const root = path.resolve(process.argv[2] || "build/web");
const CLI = path.join(repo, "build/test/bin/cropmark"), IMGDIFF = path.join(repo, "build/test/bin/imgdiff");
const FIXTURE = path.join(repo, "core/tests/data/sample_exif6.jpg");
const GOLDEN = path.join(repo, "tests/golden/crop-stroke.png");
const FONT = path.join(repo, "third_party/dejavu/DejaVuSans.ttf");
const puppeteer = (await import("puppeteer-core")).default;
const chrome = process.env.CHROME || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => existsSync(p));
if (!chrome) { console.error("no Chrome found; set CHROME"); process.exit(2); }
const tmp = mkdtempSync(path.join(os.tmpdir(), "cropmark-check-"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".txt": "text/plain", ".ttf": "font/ttf" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  // Served under a sub-path, as on GitHub Pages, to prove every address is relative.
  if (!url.pathname.startsWith("/some/path/")) { res.writeHead(404).end(); return; }
  let file = path.join(root, decodeURIComponent(url.pathname.slice("/some/path/".length)) || "index.html");
  if (file.endsWith(path.sep)) file += "index.html";
  try { res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/some/path/`;

let failures = 0;
const check = (ok, what) => { console.log((ok ? "ok   " : "FAIL ") + what); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b, tol = 0) => spawnSync(IMGDIFF, [a, b, String(tol)], { encoding: "utf8" });
const cli = (args) => execFileSync(CLI, args, { encoding: "utf8", env: { ...process.env, PMARK_FONT: FONT } });

// A PNG that claims to be 8000 x 5000 (40 megapixels): a header and nothing else.
function hugePng() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8000, 0); ihdr.writeUInt32BE(5000, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
}
function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const requests = [], problems = [];
  page.on("request", (req) => requests.push(req.url()));
  page.on("pageerror", (e) => problems.push("page error: " + e));
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("dialog", (d) => d.accept());
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0; window.__csp = []; window.__downloads = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__frames++; return raf(cb); };
    for (const name of ["setTimeout", "setInterval"]) {
      const real = window[name].bind(window);
      window[name] = (...a) => { window.__frames++; return real(...a); };
    }
    // Keep hold of the editor module, to ask it for the view (cm_web_view).
    let factory;
    Object.defineProperty(window, "createCropmark", {
      configurable: true,
      get() { return factory; },
      set(fn) { factory = (opts) => fn(opts).then((m) => (window.__ed = m)); },
    });
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
    // Keep each download instead of writing it to disk.
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__lastBlob = blob; return make(blob); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return click.call(this);
      const blob = window.__lastBlob, name = this.download;
      blob.arrayBuffer().then((buf) => window.__downloads.push({ name, type: blob.type, bytes: Array.from(new Uint8Array(buf)) }));
    };
  });

  // ---- first load: the page alone ----
  await page.goto(base, { waitUntil: "networkidle0" });
  const first = requests.filter((u) => u.startsWith(base)).map((u) => u.slice(base.length) || "index.html");
  check(first.join(",") === "index.html,style.css,theme.js,config.js,app.js", "first load fetches the page only, not the editor: " + first.join(", "));
  check(await page.$eval("#start", (e) => !e.hidden && /never|not uploaded/.test(e.textContent)), "the start screen says the photo is not uploaded");

  // ---- addresses: only the build's config.js names any, and the footer uses those ----
  const named = [];
  for (const f of ["index.html", "style.css", "theme.js", "app.js"]) {
    const m = (await readFile(path.join(root, f), "utf8")).match(/https?:\/\/[^\s"'<>)]*/gi);
    if (m) named.push(`${f}: ${m.join(" ")}`);
  }
  check(named.length === 0, "the page's own files name no address" + (named.length ? ": " + named.join("; ") : ""));
  const links = await page.evaluate(() => [["source", window.CROPMARK_SOURCE], ["author", window.CROPMARK_AUTHOR]].map(([id, url]) => {
    const a = document.getElementById(id);
    return { id, url, hidden: a.hidden, href: a.getAttribute("href") };
  }));
  const wrong = links.filter((l) => (l.url ? l.hidden || l.href !== l.url : !l.hidden));
  check(wrong.length === 0, "the footer links are the build's addresses: " +
    links.map((l) => `${l.id} ${l.url ? l.url : "(none, hidden)"}`).join(", ") +
    (wrong.length ? "; wrong: " + wrong.map((l) => l.id).join(", ") : ""));

  const view = () => page.evaluate(() => { const m = window.__ed; return [0, 1, 2, 3, 4, 5, 6].map((k) => m._cm_web_view(k)); });
  const box = () => page.$eval("#canvas", (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, bw: c.width, bh: c.height }; });
  // The mouse position (page pixels) for an image point, and the image point the
  // editor computes back from it (in 32-bit floats, as the C code does).
  const f = Math.fround;
  async function at(ix, iy) {
    const [zoom, panx, pany, dpi] = await view(), b = await box();
    const mx = Math.round((ix * zoom + panx) / dpi), my = Math.round((iy * zoom + pany) / dpi);
    return { px: b.x + mx, py: b.y + my, ix: f(f(f(mx * dpi) - f(panx)) / f(zoom)), iy: f(f(f(my * dpi) - f(pany)) / f(zoom)) };
  }
  async function drag(a, b) {
    await page.mouse.move(a.px, a.py); await page.mouse.down();
    await page.mouse.move(b.px, b.py, { steps: 1 }); await page.mouse.up();
    await sleep(120);
  }
  const key = async (k) => { await page.keyboard.press(k); await sleep(80); };
  const lastDownload = async (n) => {
    await page.waitForFunction((n) => window.__downloads.length >= n, { timeout: 20000 }, n);
    return page.evaluate((n) => window.__downloads[n - 1], n);
  };

  // ---- an oversized image is refused, with a message ----
  await writeFile(path.join(tmp, "huge.png"), hugePng());
  await (await page.$("#file")).uploadFile(path.join(tmp, "huge.png"));
  await page.waitForFunction(() => !document.querySelector("#message").hidden, { timeout: 30000 });
  const refused = await page.evaluate(() => ({ text: document.querySelector("#message").textContent, start: !document.querySelector("#start").hidden }));
  check(/too large/.test(refused.text) && /32 megapixels/.test(refused.text) && refused.start, "a 40-megapixel image is refused: " + refused.text);

  // ---- open the fixture ----
  await (await page.$("#file")).uploadFile(FIXTURE);
  await page.waitForFunction(() => window.__ed && window.__ed._cm_web_view(4) > 0, { timeout: 30000 });
  await sleep(500);
  let v = await view(), b = await box();
  check(v[4] === 480 && v[5] === 320, `the sideways JPEG (EXIF orientation 6) opens upright: ${v[4]}x${v[5]}`);
  check(b.bw === Math.round(b.w) && b.bh === Math.round(b.h), `the canvas is drawn at its own size: ${b.bw}x${b.bh} for ${b.w}x${b.h}`);
  check(await page.evaluate(() => document.activeElement === document.querySelector("#canvas")), "the editor has the keyboard after opening");
  check(await page.evaluate(() => window.__ed._cm_web_modified()) === 0, "nothing to save yet");
  await mkdir(path.join(repo, "build"), { recursive: true });
  await page.screenshot({ path: path.join(repo, "build/browser-light.png") });

  // ---- crop, then a marker stroke, with the mouse ----
  await key("c");
  const c0 = await at(40, 20), c1 = await at(340, 220);
  await drag(c0, c1);
  await key("Enter");
  const crop = { x: Math.floor(Math.min(c0.ix, c1.ix) + 0.5), y: Math.floor(Math.min(c0.iy, c1.iy) + 0.5) };
  crop.w = Math.floor(Math.max(c0.ix, c1.ix) + 0.5) - crop.x; crop.h = Math.floor(Math.max(c0.iy, c1.iy) + 0.5) - crop.y;
  v = await view();
  check(v[4] === crop.w && v[5] === crop.h, `crop by dragging: ${v[4]}x${v[5]}`);
  await key("m");
  const s0 = await at(30, 150), s1 = await at(250, 60);
  await drag(s0, s1);
  check(await page.evaluate(() => window.__ed._cm_web_modified()) === 1, "the editor reports unsaved edits");

  // ---- Ctrl+S downloads a PNG; it equals the same edit made by the command line ----
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  const png = await lastDownload(1);
  check(png.name === "sample_exif6-marked.png" && png.type === "image/png", `Ctrl+S downloads ${png.name} (${png.type})`);
  const webPng = path.join(tmp, "web.png"), cliPng = path.join(tmp, "cli.png");
  await writeFile(webPng, Buffer.from(png.bytes));
  const edit = ["--crop", `${crop.x},${crop.y},${crop.w},${crop.h}`, "--color", "e53935", "--width", "3",
    "--stroke", `${s0.ix},${s0.iy} ${s1.ix},${s1.iy}`];
  cli([FIXTURE, ...edit, "-o", cliPng]);
  let d = same(webPng, cliPng, 0);
  check(d.status === 0, "the PNG is pixel-identical to the command-line tool's for the same edit" + (d.status ? ": " + d.stderr.trim() : ""));
  if (process.env.UPDATE_GOLDEN) await writeFile(GOLDEN, Buffer.from(png.bytes));
  d = same(webPng, GOLDEN, 0);
  check(d.status === 0, "the PNG matches the stored golden image" + (d.status ? ": " + (d.stderr || "").trim() : ""));
  check(await page.evaluate(() => window.__ed._cm_web_modified()) === 0, "saved: no unsaved edits");
  check(await page.evaluate(() => window.__ed.FS.readdir("/work").filter((n) => n[0] !== ".").length) === 0, "no file is left in the editor's memory after the download");

  // ---- JPEG through the format choice ----
  await page.select("#format", "jpeg");
  await page.focus("#canvas");            // the keyboard goes back to the editor (a click would draw)
  await sleep(100);
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  const jpg = await lastDownload(2);
  check(jpg.name === "sample_exif6-marked.jpg" && jpg.type === "image/jpeg" && jpg.bytes[0] === 0xFF && jpg.bytes[1] === 0xD8, `the format choice gives a JPEG: ${jpg.name}`);
  const webJpg = path.join(tmp, "web.jpg"), cliJpg = path.join(tmp, "cli.jpg");
  await writeFile(webJpg, Buffer.from(jpg.bytes));
  cli([FIXTURE, ...edit, "-o", cliJpg]);
  d = same(webJpg, cliJpg, 0);
  check(d.status === 0, "the JPEG decodes to the same pixels as the command-line tool's" + (d.status ? ": " + d.stderr.trim() : ""));

  // ---- every tool, outlined text, then undo and redo across the crop ----
  await page.select("#format", "png");
  await page.focus("#canvas");
  await sleep(100);
  const tools = [["h", [20, 30], [200, 30]], ["a", [40, 180], [120, 110]], ["b", [150, 20], [220, 70]], ["e", [200, 120], [280, 180]]];
  for (const [k, p, q] of tools) { await key(k); await drag(await at(...p), await at(...q)); }
  await key("o");                          // outline on, before the text starts
  await key("t");
  const t0 = await at(60, 90);
  await page.mouse.click(t0.px, t0.py); await sleep(150);
  await page.keyboard.type("Look here", { delay: 20 });
  await key("Enter");
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  const full = await lastDownload(3);
  await writeFile(path.join(tmp, "full.png"), Buffer.from(full.bytes));
  check(same(path.join(tmp, "full.png"), webPng, 0).status !== 0, "highlight, arrow, box, ellipse and outlined text change the picture");
  const undoAll = 7;                       // text, 4 shapes, stroke, crop
  for (let i = 0; i < undoAll; i++) { await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control"); await sleep(60); }
  v = await view();
  check(v[4] === 480 && v[5] === 320, `undo back across the crop restores the whole photo: ${v[4]}x${v[5]}`);
  for (let i = 0; i < undoAll; i++) { await page.keyboard.down("Control"); await page.keyboard.press("y"); await page.keyboard.up("Control"); await sleep(60); }
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control");
  const again = await lastDownload(4);
  await writeFile(path.join(tmp, "again.png"), Buffer.from(again.bytes));
  check(same(path.join(tmp, "full.png"), path.join(tmp, "again.png"), 0).status === 0, "redo brings every edit back exactly");
  await page.screenshot({ path: path.join(repo, "build/browser-edited.png") });

  // ---- theme ----
  await page.click("#btn-theme"); await sleep(300);
  check(await page.evaluate(() => document.documentElement.dataset.theme === "dark" && localStorage.getItem("cropmark:theme") === "dark"), "the theme toggle is remembered under a cropmark: key");
  check(await page.evaluate(() => Object.keys(localStorage).every((k) => k.startsWith("cropmark:")) && Object.keys(localStorage).length === 1), "the theme is the only thing stored");
  await page.screenshot({ path: path.join(repo, "build/browser-dark.png") });

  // ---- idle: with a photo open and the mouse still, nothing runs ----
  await sleep(6000);                        // let the "Saved" message run out
  const f0 = await page.evaluate(() => window.__frames), r0 = requests.length;
  await sleep(2500);
  const f1 = await page.evaluate(() => window.__frames);
  check(f1 === f0 && requests.length === r0, `idle for 2.5 s: ${f1 - f0} frames or timers, ${requests.length - r0} requests`);
  await page.mouse.move(700, 400); await sleep(300);
  check((await page.evaluate(() => window.__frames)) > f1, "moving the mouse wakes the editor");

  // ---- drop and paste open a photo too ----
  const give = async (how, file) => {
    const bytes = [...await readFile(file)];
    await page.evaluate((how, bytes, name) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type: name.endsWith(".png") ? "image/png" : "image/jpeg" }));
      if (how === "drop") window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      else document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, how, bytes, path.basename(file));
  };
  await give("drop", path.join(repo, "core/tests/fuzz_seeds/icc.png"));
  await page.waitForFunction(() => window.__ed._cm_web_view(4) !== 300, { timeout: 20000 });
  const dropped = await view();
  check(dropped[4] > 0 && dropped[4] !== 300, `dropping a PNG on the page opens it: ${dropped[4]}x${dropped[5]}`);
  await give("paste", FIXTURE);
  await page.waitForFunction(() => window.__ed._cm_web_view(4) === 480, { timeout: 20000 });
  check((await view())[5] === 320, "pasting a photo opens it");

  // ---- nothing went elsewhere, nothing was blocked ----
  const outside = [...new Set(requests.filter((u) => !u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")))];
  check(outside.length === 0, "no request to any other origin" + (outside.length ? ": " + outside.join(", ") : ""));
  const csp = await page.evaluate(() => window.__csp);
  check(csp.length === 0, "no Content-Security-Policy violation" + (csp.length ? ": " + csp.join("; ") : ""));
  check(problems.length === 0, "no script errors" + (problems.length ? ": " + problems.join("; ") : ""));
  const size = execFileSync("du", ["-sb", root], { encoding: "utf8" }).split("\t")[0];
  check(Number(size) < 10e6, `the site is under 10 MB (${size} bytes)`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} check(s) failed` : "browser check ok");
process.exit(failures ? 1 : 0);
