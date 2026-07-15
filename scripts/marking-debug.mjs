/** Temporary: log pointer events on /marking-test to debug click marking. */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:3000/marking-test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleLines = [];
page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return c && c.width > 100;
  }, { timeout: 30000 });

  await page.evaluate(() => {
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "click", "gotpointercapture", "lostpointercapture"]) {
      document.addEventListener(
        type,
        (e) => {
          const t = e.target;
          const name = t && t.tagName ? t.tagName : String(t);
          if (type === "pointermove") return;
          console.log(`EVT ${type} target=${name} pid=${e.pointerId ?? "-"}`);
        },
        true
      );
    }
  });

  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(500);
  const status = await page.textContent('[data-testid="marking-test-status"]');
  console.log("STATUS:", status);
} catch (err) {
  console.log("DEBUG_ERROR:", err.message);
} finally {
  for (const line of consoleLines) console.log("CONSOLE:", line);
  await browser.close();
}
