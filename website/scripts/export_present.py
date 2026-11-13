"""Export the /present deck as files friends can open without the website.

Writes to ../presentation/:
  BDA_Presentation.html  static HTML (slides pre-rendered, images embedded, tiny vanilla JS for navigation)
  BDA_Presentation.pdf   one 16:9 page per slide

Usage (after `npm run build`):  python scripts/export_present.py
Needs: pip install playwright, and Google Chrome installed.
"""
import base64
import os
import re
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent
OUT = SITE.parent / "presentation"
IMGS = SITE / "src" / "assets" / "present"
PORT = 4181

# Plain JS replacing React: scale, fade-in, progress, keyboard/click navigation, track dot.
NAV_JS = r"""
(function () {
  var root = document.documentElement; root.classList.add('js');
  var deck = document.querySelector('.deck'), secs = [].slice.call(deck.querySelectorAll('.slide')), N = secs.length;
  var bar = deck.querySelector('.deck-bar i'), lap = deck.querySelector('.deck-hud .mono');
  var path = deck.querySelector('.mini-track path'), dot = deck.querySelector('.mini-track circle');
  var top = deck.querySelector('.deck-top');
  function fit() { deck.style.setProperty('--s', Math.min(innerWidth / 1600, innerHeight / 900)); }
  addEventListener('resize', fit); fit();
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('in', e.isIntersecting); }); },
    { root: deck, threshold: 0.45 });
  secs.forEach(function (s) { io.observe(s); });
  function onScroll() {
    var h = deck.clientHeight, p = deck.scrollTop / Math.max(1, deck.scrollHeight - h), i = Math.min(N - 1, Math.round(deck.scrollTop / h));
    bar.style.width = p * 100 + '%';
    lap.textContent = 'LAP ' + String(i + 1).padStart(2, '0') + '/' + N;
    if (path && dot) { var q = path.getPointAtLength(path.getTotalLength() * Math.min(0.999, p)); dot.setAttribute('cx', q.x); dot.setAttribute('cy', q.y); }
  }
  deck.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  function cur() { return Math.round(deck.scrollTop / deck.clientHeight); }
  function go(k) { deck.scrollTo({ top: Math.max(0, Math.min(N - 1, k)) * deck.clientHeight, behavior: 'smooth' }); }
  function fs() { return document.fullscreenElement === deck; }
  function toggle() { fs() ? document.exitFullscreen() : deck.requestFullscreen && deck.requestFullscreen(); }
  document.addEventListener('fullscreenchange', function () { deck.classList.toggle('fs', fs()); if (top) top.style.display = fs() ? 'none' : ''; fit(); });
  addEventListener('keydown', function (e) {
    var k = e.key;
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].indexOf(k) >= 0) { e.preventDefault(); go(cur() + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(k) >= 0) { e.preventDefault(); go(cur() - 1); }
    else if (k === 'Home') go(0); else if (k === 'End') go(N - 1);
    else if (k === 'f' || k === 'F') toggle();
  });
  deck.addEventListener('click', function (e) {
    if (e.target.closest('button')) return toggle();
    if (!fs()) return; e.clientX < innerWidth * 0.25 ? go(cur() - 1) : go(cur() + 1);
  });
})();
"""

# Without JS the slides must still be visible.
NOJS_CSS = """
html:not(.js) .deck .stage { opacity: 1; filter: none; }
html:not(.js) .deck .funnel div { width: var(--w); }
.deck .deck-top button { margin-left: auto; }
"""


def data_uri(name):
    """Built assets are named <stem>-<hash>.png; embed the original file."""
    f = IMGS / (name.split("-")[0].removesuffix(".png") + ".png")
    return "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode()


def main():
    OUT.mkdir(exist_ok=True)
    vite = SITE / "node_modules" / ".bin" / ("vite.cmd" if os.name == "nt" else "vite")
    srv = subprocess.Popen([str(vite), "preview", "--port", str(PORT), "--strictPort"], cwd=SITE,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(channel="chrome")
            pg = b.new_page(viewport={"width": 1600, "height": 900})
            pg.goto(f"http://localhost:{PORT}/#/present")
            pg.wait_for_selector(".mini-track circle")
            pg.wait_for_timeout(800)
            css = pg.evaluate("""[...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\\n') }
                                  catch (e) { return '' } }).join('\\n')""")
            deck = pg.evaluate("""(() => {
                const d = document.querySelector('.deck').cloneNode(true);
                d.querySelectorAll('.links, a.deck-btn').forEach(e => e.remove());   // site links are dead offline
                d.querySelectorAll('.slide').forEach(s => s.classList.remove('in'));
                d.querySelectorAll('img').forEach(i => i.removeAttribute('loading'));
                return d.outerHTML })()""")
            b.close()
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(srv.pid)] if os.name == "nt" else ["kill", str(srv.pid)],
                       capture_output=True)

    deck = re.sub(r'src="[^"]*?/([^/"]+\.png)"', lambda m: f'src="{data_uri(m.group(1))}"', deck)
    assert "data:image/png" in deck and 'src="./' not in deck
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baku 2025 · BDA Presentation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,300;0,400;0,600;0,700;0,900;1,700;1,900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
{css}
{NOJS_CSS}
</style>
</head>
<body>
{deck}
<script>{NAV_JS}</script>
</body>
</html>
"""
    out_html = OUT / "BDA_Presentation.html"
    out_html.write_text(html, encoding="utf-8")
    print("wrote", out_html, f"{out_html.stat().st_size / 1e6:.1f} MB")

    # PDF: screenshot each slide of the static file itself
    shots = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1.5)
        pg.goto(out_html.as_uri())
        pg.wait_for_timeout(1200)
        n = pg.locator(".slide").count()
        pg.evaluate("document.querySelector('.deck-top') && (document.querySelector('.deck-top').style.display='none')")
        for i in range(n):
            pg.evaluate(f"document.querySelector('.deck').scrollTo(0, {i} * innerHeight)")
            pg.wait_for_timeout(1700)
            f = OUT / f"_slide{i:02d}.png"
            pg.screenshot(path=str(f))
            shots.append(f)
        b.close()
    # let Chrome print the screenshots, one 16:9 page each
    imgs = "".join(f'<img src="{f.name}">' for f in shots)
    sheet = OUT / "_slides.html"
    sheet.write_text("<style>@page{size:1600px 900px;margin:0}body{margin:0}"
                     "img{display:block;width:1600px;height:900px;page-break-after:always}</style>" + imgs, encoding="utf-8")
    out_pdf = OUT / "BDA_Presentation.pdf"
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page()
        pg.goto(sheet.as_uri())
        pg.wait_for_load_state("load")
        pg.pdf(path=str(out_pdf), width="1600px", height="900px", print_background=True,
               margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
        b.close()
    for f in shots + [sheet]:
        f.unlink()
    print("wrote", out_pdf, f"{out_pdf.stat().st_size / 1e6:.1f} MB,", len(shots), "pages")


if __name__ == "__main__":
    main()
