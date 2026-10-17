// src/lib/pdfPageViewerHtml.ts
//
// The page the PDF page reader's WebView loads. It renders ONE PDF page at a time to a canvas with pdf.js, and owns
// everything that has to feel instant: pinch-zoom, pan, double-tap zoom, swipe and tap-zone page turns. React Native
// owns the chrome (bars, scrubber, sheets, progress saving) and talks to this page through two tiny channels:
//
//   RN -> page : window.__ako.cmd({ t: "open" | "goto" | "style", ... })   (always JSON-built by the caller)
//   page -> RN : ReactNativeWebView.postMessage(JSON.stringify({ t, ... }))
//                t: "ready" | "loaded" | "page" | "tap" | "zoom" | "error"
//
// Why a WebView and not a native PDF module: react-native-webview already ships in the installed binaries, so this
// works through an OTA update. A new native module would crash every install that hasn't been rebuilt.
//
// pdf.js is the UMD 3.x build — it runs on old Android System WebViews that the 4.x ESM build does not.
// The worker is started from a Blob that importScripts() the CDN file (a cross-origin Worker URL is blocked);
// if a worker can't start, pdf.js falls back to the main thread by itself.

export const PDF_JS_VERSION = "3.11.174";
const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + PDF_JS_VERSION;

/** Origin the page is served from. Must match the allow-list in the WebView's onShouldStartLoadWithRequest. */
export const PDF_VIEWER_BASE_URL = "https://pdf-viewer.ako.local/";

const SCRIPT = String.raw`
(function () {
  var post = function (m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
  var stage = document.getElementById("stage");
  var holder = document.getElementById("holder");
  var note = document.getElementById("note");

  var MAX_ZOOM = 4, DOUBLE_TAP_ZOOM = 2.5, SUPERSAMPLE = 1.5, MAX_PIXELS = 12e6;
  var style = { bg: "#fff", filterText: "none", filterPictorial: "none" };
  var pdf = null, pageNum = 1, numPages = 0, token = 0, task = null, pictorial = false, canvas = null;
  var z = { s: 1, x: 0, y: 0 };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function say(t) { note.textContent = t || ""; note.style.display = t ? "block" : "none"; }

  // ------------------------------------------------------------------ style
  function applyStyle() {
    document.documentElement.style.background = style.bg;
    document.body.style.background = style.bg;
    if (canvas) canvas.style.filter = pictorial ? style.filterPictorial : style.filterText;
  }

  // ------------------------------------------------------------------ zoom / pan
  function applyZoom() {
    if (!canvas) return;
    var cw = stage.clientWidth, ch = stage.clientHeight;
    var w = canvas.offsetWidth * z.s, h = canvas.offsetHeight * z.s;
    var mx = Math.max(0, (w - cw) / 2), my = Math.max(0, (h - ch) / 2);
    z.x = clamp(z.x, -mx, mx);
    z.y = clamp(z.y, -my, my);
    holder.style.transform = "translate(" + z.x + "px," + z.y + "px) scale(" + z.s + ")";
  }
  function resetZoom() { z.s = 1; z.x = 0; z.y = 0; applyZoom(); post({ t: "zoom", s: 1 }); }
  function zoomAbout(px, py, ns) {
    var r = stage.getBoundingClientRect();
    var ox = px - r.left - r.width / 2, oy = py - r.top - r.height / 2;
    var cx = (ox - z.x) / z.s, cy = (oy - z.y) / z.s;
    z.s = clamp(ns, 1, MAX_ZOOM);
    z.x = ox - cx * z.s; z.y = oy - cy * z.s;
    if (z.s <= 1.01) { z.s = 1; z.x = 0; z.y = 0; }
    applyZoom();
    post({ t: "zoom", s: z.s });
  }

  // ------------------------------------------------------------------ render
  async function show(n) {
    if (!pdf) return;
    n = clamp(Math.round(n), 1, numPages);
    var my = ++token;
    if (task) { try { task.cancel(); } catch (e) {} task = null; }
    try {
      var page = await pdf.getPage(n);
      if (my !== token) return;
      var base = page.getViewport({ scale: 1 });
      var cw = stage.clientWidth, ch = stage.clientHeight;
      var fit = Math.min(cw / base.width, ch / base.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var scale = fit * dpr * SUPERSAMPLE;
      var px = base.width * base.height * scale * scale;
      if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.floor(vp.width));
      c.height = Math.max(1, Math.floor(vp.height));
      c.style.width = Math.floor(base.width * fit) + "px";
      c.style.height = Math.floor(base.height * fit) + "px";
      task = page.render({ canvasContext: c.getContext("2d"), viewport: vp });
      await task.promise;
      task = null;
      if (my !== token) return;

      // A page with (almost) no text layer is a picture — a flyer, a scan, a photo spread. Dark mode must not
      // invert those (faces turn into negatives); the host styles them with filterPictorial instead.
      var chars = 0;
      try {
        var tc = await page.getTextContent();
        for (var i = 0; i < tc.items.length; i++) chars += (tc.items[i].str || "").trim().length;
      } catch (e) {}
      if (my !== token) return;
      pictorial = chars < 20;

      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = c;
      holder.appendChild(c);
      pageNum = n;
      applyStyle();
      resetZoom();
      say("");
      post({ t: "page", n: n, pictorial: pictorial });
      if (n < numPages) pdf.getPage(n + 1).catch(function () {}); // warm the next page
    } catch (err) {
      if (err && err.name === "RenderingCancelledException") return;
      if (my === token) post({ t: "error", code: "render", message: "Couldn't draw this page." });
    }
  }

  function turn(d) {
    var n = pageNum + d;
    if (n < 1 || n > numPages) { post({ t: "edge", dir: d }); return; }
    show(n);
  }

  // ------------------------------------------------------------------ open
  async function open(msg) {
    if (!window.pdfjsLib) { post({ t: "error", code: "lib", message: "The reader couldn't load. Check your connection." }); return; }
    say("Opening book…");
    try {
      var doc = await window.pdfjsLib.getDocument({ url: msg.url, withCredentials: false }).promise;
      pdf = doc; numPages = doc.numPages;
      post({ t: "loaded", pages: numPages });
      await show(msg.page || 1);
    } catch (err) {
      var name = err && err.name;
      var m = name === "PasswordException" ? "This PDF is password-protected."
        : name === "InvalidPDFException" ? "This file isn't a valid PDF."
        : "Couldn't open this book. Check your connection and try again.";
      say("");
      post({ t: "error", code: name || "open", message: m });
    }
  }

  window.__ako = {
    cmd: function (m) {
      if (!m) return;
      if (m.t === "style") { style = Object.assign(style, m.style || {}); applyStyle(); }
      else if (m.t === "open") { if (m.style) style = Object.assign(style, m.style); applyStyle(); open(m); }
      else if (m.t === "goto") { show(m.page); }
      else if (m.t === "resetZoom") { resetZoom(); }
    }
  };

  window.addEventListener("resize", function () { if (pdf) show(pageNum); });

  // ------------------------------------------------------------------ gestures
  var G = { mode: "", sx: 0, sy: 0, st: 0, moved: false, tx: 0, ty: 0, d0: 0, s0: 1, lastTap: 0, lastX: 0, lastY: 0, timer: 0 };
  function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  stage.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      G.mode = "pinch"; G.d0 = dist(e.touches[0], e.touches[1]); G.s0 = z.s; G.moved = true;
      clearTimeout(G.timer);
    } else if (e.touches.length === 1) {
      var t = e.touches[0];
      G.mode = "one"; G.sx = t.clientX; G.sy = t.clientY; G.st = Date.now(); G.moved = false;
      G.tx = z.x; G.ty = z.y;
    }
  }, { passive: false });

  stage.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (G.mode === "pinch" && e.touches.length === 2) {
      var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAbout(mx, my, G.s0 * dist(e.touches[0], e.touches[1]) / Math.max(G.d0, 1));
    } else if (G.mode === "one" && e.touches.length === 1) {
      var t = e.touches[0], dx = t.clientX - G.sx, dy = t.clientY - G.sy;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) G.moved = true;
      if (z.s > 1) { z.x = G.tx + dx; z.y = G.ty + dy; applyZoom(); }
    }
  }, { passive: false });

  stage.addEventListener("touchend", function (e) {
    e.preventDefault();
    if (G.mode === "pinch") { if (e.touches.length === 0) G.mode = ""; return; }
    if (G.mode !== "one") return;
    G.mode = "";
    var t = e.changedTouches[0], dx = t.clientX - G.sx, dy = t.clientY - G.sy, dt = Date.now() - G.st;

    if (G.moved) {
      // A swipe turns the page only at fit-zoom; when zoomed in, a drag is a pan.
      if (z.s === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 700) turn(dx < 0 ? 1 : -1);
      return;
    }
    if (dt > 400) return; // a long press is not a tap

    var now = Date.now();
    if (now - G.lastTap < 280 && Math.hypot(t.clientX - G.lastX, t.clientY - G.lastY) < 40) {
      clearTimeout(G.timer); G.lastTap = 0;
      if (z.s > 1) { z.s = 1; z.x = 0; z.y = 0; applyZoom(); post({ t: "zoom", s: 1 }); }
      else zoomAbout(t.clientX, t.clientY, DOUBLE_TAP_ZOOM);
      return;
    }
    G.lastTap = now; G.lastX = t.clientX; G.lastY = t.clientY;
    var w = stage.clientWidth, x = t.clientX;
    G.timer = setTimeout(function () {
      // Tap zones (left / right third turn the page, the middle shows or hides the bars) — fit-zoom only.
      if (z.s === 1 && x < w * 0.3) turn(-1);
      else if (z.s === 1 && x > w * 0.7) turn(1);
      else post({ t: "tap" });
    }, 240);
  }, { passive: false });

  stage.addEventListener("touchcancel", function () { G.mode = ""; clearTimeout(G.timer); });

  // ------------------------------------------------------------------ boot
  if (window.pdfjsLib) {
    try {
      var blob = new Blob(["importScripts('" + "${CDN}/pdf.worker.min.js" + "');"], { type: "text/javascript" });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } catch (e) {}
  }
  post({ t: "ready", lib: !!window.pdfjsLib });
})();
`;

export function buildPdfViewerHtml(): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">' +
    "<style>" +
    "*{box-sizing:border-box}" +
    "html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;background:#fff}" +
    "#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;touch-action:none;overflow:hidden}" +
    "#holder{transform-origin:center center;will-change:transform}" +
    "canvas{display:block;border-radius:2px;box-shadow:0 8px 30px rgba(0,0,0,.25)}" +
    "#note{position:fixed;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font:14px -apple-system,Roboto,sans-serif;color:#8a8a8e;display:none;pointer-events:none}" +
    "</style></head><body>" +
    '<div id="stage"><div id="holder"></div></div><div id="note"></div>' +
    '<script src="' + CDN + '/pdf.min.js" onerror="try{window.ReactNativeWebView.postMessage(JSON.stringify({t:\'ready\',lib:false}))}catch(e){}"></script>' +
    "<script>" + SCRIPT + "</script>" +
    "</body></html>"
  );
}
