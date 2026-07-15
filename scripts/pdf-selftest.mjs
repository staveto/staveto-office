/**
 * Headless check of /pdf-test — verifies pdf.js + worker render in a real
 * browser against the running dev server. Usage: node scripts/pdf-selftest.mjs
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:3000/pdf-test";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleLines = [];
page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="pdf-test-status"]');
      return el && !el.textContent.includes("running");
    },
    { timeout: 30000 }
  );
  const status = await page.textContent('[data-testid="pdf-test-status"]');
  console.log("STATUS:", status);
} catch (err) {
  console.log("SELFTEST_ERROR:", err.message);
} finally {
  for (const line of consoleLines) console.log("CONSOLE:", line);
  await browser.close();
}
