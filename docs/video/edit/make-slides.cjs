// Renders the title slides (1920x1080 PNG) from slides.json. Only needed if you change a title.
// Run: node make-slides.cjs  (needs Playwright: npm i -g playwright && npx playwright install chromium)
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
(async () => {
const slides = JSON.parse(readFileSync(join(__dirname, "slides.json"), "utf8"));
const logo = readFileSync(join(__dirname, "slides/_logo.png")).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const s of slides) {
  await page.setContent(`<html><body style="margin:0;width:1920px;height:1080px;background:#0f172a;font-family:Inter,sans-serif;color:#f8fafc;display:flex;flex-direction:column;justify-content:center;padding:0 160px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:20px;font-size:30px;color:#94a3b8;letter-spacing:.04em;text-transform:uppercase">
      <img src="data:image/png;base64,${logo}" style="width:56px;height:56px;border-radius:12px">Competitor Monitor · ${s.n} of ${slides.length}</div>
    <div style="font-size:96px;font-weight:700;line-height:1.08;margin-top:44px;max-width:1500px">${s.title}</div>
    <div style="height:6px;width:140px;background:#2f5bea;border-radius:3px;margin:48px 0 36px"></div>
    <div style="font-size:40px;color:#cbd5e1">${s.proves}</div></body></html>`);
  await page.screenshot({ path: join(__dirname, `slides/slide-${String(s.n).padStart(2, "0")}.png`) });
}
await browser.close();
console.log(`made ${slides.length} slides`);
})();
