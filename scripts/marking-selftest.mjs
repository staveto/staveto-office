/**
 * Headless check of /marking-test — verifies click marks and freehand shape
 * drawing in the estimator PDF viewer. Usage: node scripts/marking-selftest.mjs
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:3000/marking-test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleLines = [];
page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

const status = () => page.textContent('[data-testid="marking-test-status"]');

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="marking-test-status"]');
      return el && el.textContent.includes("MARKING_READY");
    },
    { timeout: 30000 }
  );
  // Wait for the canvas render (canvas gets explicit width when rendered).
  await page.waitForFunction(
    () => {
      const c = document.querySelector("canvas");
      return c && c.width > 100;
    },
    { timeout: 15000 }
  );
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  console.log("CANVAS:", JSON.stringify(box));

  // 1) Quick click → point mark
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(400);
  console.log("AFTER_CLICK:", await status());

  // 2) Drag → freehand shape (a rough circle)
  const cx = box.x + box.width * 0.6;
  const cy = box.y + box.height * 0.5;
  const r = 40;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let a = 0; a <= 360; a += 20) {
    const rad = (a * Math.PI) / 180;
    await page.mouse.move(cx + r * Math.cos(rad), cy + r * Math.sin(rad), { steps: 2 });
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  console.log("AFTER_DRAG:", await status());

  // 3) SVG polygon should exist for the shape mark
  const polys = await page.locator("svg polygon").count();
  console.log("POLYGONS:", polys);
} catch (err) {
  console.log("SELFTEST_ERROR:", err.message);
} finally {
  for (const line of consoleLines) console.log("CONSOLE:", line);
  await browser.close();
}
