/** Madami (mission 3) segment runner.
 *
 * Madami needs ~22000 ticks for 1400 GOOP, past a single run budget, so the
 * route is segmented from an exported campaign save the way a player would:
 * import the save, play a bounded segment through the UI, export, repeat.
 *
 * Usage: node tests/browser/madami.mjs [saveFile]
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
      // An off-canvas projection cannot be tapped; skip it rather than tap void.
      if (!at || at.x < 0 || at.x > viewport.width || at.y < 0 || at.y > viewport.height)
        continue;
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

  // The cells immediately around the base (64.5, 109.5) are too cramped for a
  // plant footprint: the order is accepted and the Engineer walks out, then the
  // task is dropped silently (n130 0, n126 255, no job, no funds charged).
  // Open ground to the north-east works: measured at (80.5, 90.5) the build
  // starts (stage 5), charges 238 of 800 funds and completes. Candidates are
  // therefore spread over open terrain, nearest-usable first.
  const RECYCLE_SITES = [
    [80.5, 90.5], [82.5, 88.5], [78.5, 88.5], [82.5, 92.5],
    [78.5, 92.5], [84.5, 90.5], [76.5, 90.5], [80.5, 86.5],
    [80.5, 94.5], [72.5, 100.5],
  ];
  const EXTRACTOR_SITES = [
    [84.5, 86.5], [76.5, 86.5], [84.5, 94.5], [76.5, 94.5],
    [72.5, 104.5], [88.5, 90.5],
  ];

  const outPath = resolve(
    process.env.MADAMI_OUT || resolve(out, "915-madami-segment1.json"),
  );
  // Export after every completed build: a 420s run can die mid-segment and a
  // fresh browser context has no IndexedDB, so an unexported build is lost.
  const exportSave = async (tag) => {
    await page.getByRole("button", { name: "Save / load", exact: true }).click();
    await page.evaluate(() => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob.type === "application/json") window.__madamiSaveText = blob.text();
        return original(blob);
      };
    });
    const download = page.waitForEvent("download").catch(() => null);
    await page
      .getByRole("button", { name: "Export campaign save", exact: true })
      .click();
    const evt = await download;
    const failure = evt ? await evt.failure() : "no-event";
    if (evt && failure === null) await evt.saveAs(outPath);
    else writeFileSync(outPath, await page.evaluate(() => window.__madamiSaveText));
    const saved = JSON.parse(readFileSync(outPath, "utf8"));
    console.log(
      JSON.stringify({
        exported: tag,
        path: outPath,
        failure,
        bytes: readFileSync(outPath).length,
        missionId: saved.missionId ?? saved.world?.missionId ?? null,
        goop: saved.world?.players?.[0]?.goop ?? saved.players?.[0]?.goop ?? null,
        completed: saved.world?.players?.[0]?.completed ?? saved.players?.[0]?.completed ?? null,
      }),
    );
    // Close the dialog so the next build can continue: the open dialog's
    // backdrop intercepts pointer events and every later click times out.
    const dialog = page.getByRole("dialog").first();
    await dialog
      .getByRole("button", { name: "Resume", exact: true })
      .first()
      .click()
      .catch(async () => {
        await page.keyboard.press("Escape").catch(() => {});
      });
    // Verify the backdrop is gone before returning.
    await page
      .locator("div[role=dialog]")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  };

  const steps = [];
  const plantCeiling = Number(process.env.MADAMI_PLANTS || 4);
  for (let i = 0; i < plantCeiling; i++) {
    const outcome = await buildAt("Recycling Plant", 4, RECYCLE_SITES, i + 1);
    steps.push({ label: "Recycling Plant", selector: 4, outcome });
    if (outcome === "built" || outcome === "already-built") await exportSave(`plant-${i + 1}`);
    if (outcome === "locked" || outcome === "no-site" || outcome === "no-engineer") break;
    if (process.env.MADAMI_PLANTS_ONLY) continue;
  }
  // Extractors cost 650 and the plants only leave ~86 funds, so they are
  // deferred until recycling income accrues in a later segment.
  if (!process.env.MADAMI_PLANTS_ONLY) {
    for (let i = 0; i < 2; i++) {
      const outcome = await buildAt("Extractor", 11, EXTRACTOR_SITES, i + 1);
      steps.push({ label: "Extractor", selector: 11, outcome });
      if (outcome === "built") await exportSave(`extractor-${i + 1}`);
      if (outcome === "locked" || outcome === "no-site" || outcome === "no-engineer") break;
    }
  }

  // Let the economy run: construction completes and GOOP accumulates.
  await page.evaluate(() => window.CR.advanceCampaign(1200));
  const after = await readState();
  console.log(JSON.stringify({ steps, after, errors }));
  await exportSave("final");
}

await context.close();
await browser.close();
