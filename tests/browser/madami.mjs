/** Madami (mission 3) segment runner.
 *
 * Madami needs ~22000 ticks for 1400 GOOP, past a single run budget, so the
 * route is segmented from an exported campaign save the way a player would:
 * import the save, play a bounded segment through the UI, export, repeat.
 *
 * Usage: node tests/browser/madami.mjs [saveFile]
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifact = resolve("dist/genewars-sfhs.html"),
  out = resolve(".private/browser-campaign"),
  savePath = resolve(process.argv[2] || resolve(out, "915-madami-start.json"));
mkdirSync(out, { recursive: true });
if (!existsSync(savePath)) throw new Error(`missing save: ${savePath}`);

const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

const viewport = process.env.MADAMI_VIEWPORT
  ? JSON.parse(process.env.MADAMI_VIEWPORT)
  : { width: 915, height: 412 };

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--allow-file-access-from-files",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 1000,
    hasTouch: viewport.width < 1000,
  }),
  page = await context.newPage(),
  errors = [];
context.setDefaultTimeout(120000);
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pathToFileURL(artifact).href);
// Boot order a player follows: start the campaign, deploy into mission 1, and
// only then does the save/load dialog exist for importing the Madami state.
await page
  .getByRole("button", { name: "Start original campaign", exact: true })
  .click();
await page
  .getByRole("button", { name: "Deploy specialists", exact: true })
  .click();
await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
await page.getByRole("button", { name: "Save / load", exact: true }).click();

const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page
    .getByRole("button", { name: "Import campaign save", exact: true })
    .click(),
]);
await chooser.setFiles(savePath);
await page.waitForFunction(
  () => window.CR.inspect().campaign?.world?.missionId === 3,
);

const state = await page.evaluate(() => {
  const c = window.CR.inspect().campaign,
    w = c.world,
    p = w.players[0];
  return {
    missionId: w.missionId,
    phase: w.phase,
    frame: w.frame,
    funds: p.funds,
    goop: p.goop,
    capacity: p.capacity,
    progress: p.progress,
    objectives: [
      ...document.querySelectorAll("#campaign-objectives li, .objective"),
    ]
      .map((e) => e.textContent?.trim())
      .filter(Boolean),
  };
});
console.log(JSON.stringify({ savePath, viewport, state, errors }));
await context.close();
await browser.close();
