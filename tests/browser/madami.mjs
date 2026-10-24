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

const readState = () =>
  page.evaluate(() => {
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

const state = await readState();
console.log(JSON.stringify({ savePath, viewport, state, errors }));

if (process.env.MADAMI_PLAY) {
  console.log("PLAY START");
  const portrait = viewport.width < viewport.height;
  const openTab = async (name) => {
    if (!portrait) return;
    await page.getByRole("button", { name, exact: true }).click();
  };

  // Let the specialists land and the Engineer become ready.
  await page.evaluate(() => window.CR.advanceCampaign(300));
  const phaseAfterAdvance = await page.evaluate(
    () => window.CR.inspect().campaign?.world?.phase,
  );
  console.log("PHASE AFTER ADVANCE", phaseAfterAdvance);
  await page.waitForFunction(
    () => window.CR.inspect().campaign?.world?.phase === "active",
  );
  console.log("WAIT DONE");

  const readyEngineer = async () => {
    for (let i = 0; i < 40; i++) {
      const ready = await page.evaluate(() => {
        const w = window.CR.inspect().campaign.world;
        const e = w.actors.find(
          (a) => w.players[a.owner].blueprints[a.blueprintIndex].category === 0,
        );
        return !!e && !!e.ready;
      });
      if (ready) return true;
      await page.evaluate(() => window.CR.advanceCampaign(100));
    }
    return false;
  };

  const buildAt = async (label, selector, sites, targetCount) => {
    console.log("BUILD START", label, "target", targetCount);
    const initial = await page.evaluate(
      (s) => window.CR.inspect().campaign.world.players[0].completed[s],
      selector,
    );
    if (initial >= targetCount) return "already-built";
    if (!(await readyEngineer())) return "no-engineer";
    console.log("ENGINEER READY", label);
    await openTab("Units");
    await page.getByRole("button", { name: /Engineer · skill/ }).click();
    console.log("ENGINEER CLICKED", label);
    await openTab("Build");
    const enabled = await page.evaluate((name) => {
      const buttons = [...document.querySelectorAll("#campaign-build button")];
      const b = buttons.find((n) => n.textContent.startsWith(name + " · "));
      return !!b && !b.disabled;
    }, label);
    console.log("ENABLED", label, enabled);
    if (!enabled) return "locked";
    for (const [x, y] of sites) {
      const current = await page.evaluate(
        (s) => window.CR.inspect().campaign.world.players[0].completed[s],
        selector,
      );
      if (current >= targetCount) return "built";
      console.log("SITE", label, x, y, "current", current);
      await openTab("Build");
      await page
        .getByRole("button", { name: new RegExp(`^${label} ·`) })
        .click();
      const at = await page.evaluate(([px, py]) => window.CR.project(px, py), [x, y]);
      if (!at) continue;
      if (viewport.width < 1000) await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.click(at.x, at.y);
      const notice = await page.evaluate(
        () => document.querySelector("#campaign-notice")?.textContent ?? "",
      );
      console.log("NOTICE", label, x, y, notice);
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.CR.advanceCampaign(400));
        const done = await page.evaluate(
          (s) => window.CR.inspect().campaign.world.players[0].completed[s],
          selector,
        );
        if (done >= targetCount) return "built";
      }
    }
    return "no-site";
  };

  // The base sits at cell (64.5, 109.5) on a 128x128 map. First build the
  // Recycling Plants that raise capacity and income, then Extractors.
  const RECYCLE_SITES = [
    [64.5, 108.5], [65.5, 108.5], [64.5, 107.5], [65.5, 107.5],
    [63.5, 108.5], [66.5, 108.5], [63.5, 107.5], [66.5, 107.5],
  ];
  const EXTRACTOR_SITES = [
    [67.5, 108.5], [67.5, 107.5], [62.5, 108.5], [62.5, 107.5],
  ];

  const steps = [];
  for (let i = 0; i < 4; i++) {
    steps.push({
      label: "Recycling Plant",
      selector: 4,
      outcome: await buildAt("Recycling Plant", 4, RECYCLE_SITES, i + 1),
    });
  }
  for (let i = 0; i < 2; i++) {
    steps.push({
      label: "Extractor",
      selector: 11,
      outcome: await buildAt("Extractor", 11, EXTRACTOR_SITES, i + 1),
    });
  }

  // Let the economy run: construction completes and GOOP accumulates.
  await page.evaluate(() => window.CR.advanceCampaign(2400));
  const after = await readState();
  console.log(JSON.stringify({ steps, after, errors }));

  // Export the segment save for the next run, the way a player would.
  await page.getByRole("button", { name: "Save / load", exact: true }).click();
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === "application/json") window.__madamiSaveText = blob.text();
      return original(blob);
    };
  });
  const saveDownload = page.waitForEvent("download").catch(() => null);
  await page
    .getByRole("button", { name: "Export campaign save", exact: true })
    .click();
  const saveEvent = await saveDownload;
  const saveFailure = saveEvent ? await saveEvent.failure() : "no-event";
  const outPath = resolve(
    process.env.MADAMI_OUT || resolve(out, "915-madami-segment1.json"),
  );
  if (saveEvent && saveFailure === null) await saveEvent.saveAs(outPath);
  else writeFileSync(outPath, await page.evaluate(() => window.__madamiSaveText));
  const saved = JSON.parse(readFileSync(outPath, "utf8"));
  console.log(
    JSON.stringify({
      madamiSave: outPath,
      saveFailure,
      bytes: readFileSync(outPath).length,
      missionId: saved.missionId ?? saved.world?.missionId ?? null,
      goop: saved.world?.players?.[0]?.goop ?? saved.players?.[0]?.goop ?? null,
    }),
  );
}

await context.close();
await browser.close();
