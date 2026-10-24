import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const artifact = resolve("dist/genewars-sfhs.html"),
  out = resolve(".private/browser-campaign");
mkdirSync(out, { recursive: true });
const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--allow-file-access-from-files",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  const viewports = process.env.CAMPAIGN_VIEWPORTS
    ? JSON.parse(process.env.CAMPAIGN_VIEWPORTS)
    : [
        { width: 1440, height: 900 },
        { width: 915, height: 412 },
        { width: 412, height: 915 },
      ];
  for (const viewport of viewports) {
    const context = await browser.newContext({
        viewport,
        isMobile: viewport.width < 1000,
        hasTouch: viewport.width < 1000,
      }),
      page = await context.newPage(),
      errors = [],
      requests = [];
    context.setDefaultTimeout(120000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (!/^(file:|data:|blob:)/.test(r.url())) requests.push(r.url());
    });
    await context.setOffline(true);
    await context.route(/https?:\/\//, (r) => r.abort());
    await page.goto(pathToFileURL(artifact).href);
    await page
      .getByRole("button", { name: "Start original campaign", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Deploy specialists", exact: true })
      .click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.evaluate(() => window.CR.advanceCampaign(250));
    await page.getByRole("button", { name: /Engineer · skill/ }).click();
    await page.screenshot({
      path: resolve(out, `${viewport.width}-start.png`),
    });
    if (viewport.width < viewport.height)
      await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: /^Extractor ·/ }).click();
    const p = await page.evaluate(() => window.CR.project(79.5, 51.5));
    assert.ok(p);
    if (viewport.width < 1000) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.evaluate(() => window.CR.advanceCampaign(120));
    const state = await page.evaluate(() => {
      const c = window.CR.inspect().campaign,
        w = c.world;
      return {
        phase: w.phase,
        frame: w.frame,
        task: w.specialists.records[0][88] & 1,
        constructionStage: w.specialists.records[0][136],
        ready: w.actors[0].ready,
        selection: c.selection,
        notices: w.notices.slice(-3),
      };
    });
    assert.equal(state.phase, "active");
    assert.ok(state.ready);
    assert.ok(state.task, JSON.stringify({ state, p }));
    await page
      .getByRole("button", { name: "Save / load", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save slot 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Load slot 1", exact: true })
      .click();
    await page.getByRole("button", { name: /Engineer · skill/ }).waitFor();
    await page.waitForFunction(
      () =>
        window.CR.inspect().campaign.loadCount === 1 &&
        !window.CR.inspect().campaign.loading,
    );
    await page.evaluate(() => window.CR.advanceCampaign(1400));
    await page.waitForFunction(() => {
      const c = window.CR.inspect().campaign;
      return c.renderErrors.length > 0 || c.renderedTick === c.world.tick;
    });
    const final = await page.evaluate(() => {
      const w = window.CR.inspect().campaign.world;
      return {
        phase: w.phase,
        frame: w.frame,
        completed: w.players[0].completed[11],
        funds: w.players[0].funds,
        notices: w.notices.slice(-3),
        pure: window.CR.renderPurity(),
        renderErrors: window.CR.inspect().campaign.renderErrors,
      };
    });
    assert.equal(final.completed, 1);
    assert.equal(final.phase, "active");
    assert.equal(final.pure, true);
    assert.deepEqual(final.renderErrors, []);
    await page.screenshot({
      path: resolve(out, `${viewport.width}-extractor.png`),
    });
    const builds = [];
    for (const [label, x, y] of [
      ["First Stage Distributor", 82.5, 51.5],
      ["Photon Processor", 79.5, 53.5],
      ["Photon Processor", 83.5, 53.5],
      ["Photon Processor", 79.5, 54.5],
    ]) {
      if (viewport.width < viewport.height)
        await page.getByRole("button", { name: "Units", exact: true }).click();
      await page.getByRole("button", { name: /Engineer · skill/ }).click();
      if (viewport.width < viewport.height)
        await page.getByRole("button", { name: "Build", exact: true }).click();
      await page
        .getByRole("button", { name: new RegExp(`^${label} ·`) })
        .click();
      const point = await page.evaluate(
        ([x, y]) => window.CR.project(x, y),
        [x, y],
      );
      assert.ok(point);
      if (viewport.width < 1000) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      let status;
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.CR.advanceCampaign(100));
        status = await page.evaluate(() => {
          const w = window.CR.inspect().campaign.world;
          return {
            phase: w.phase,
            frame: w.frame,
            task: w.specialists.records[0][88] & 1,
            constructionStage: w.specialists.records[0][136],
            idle:
              w.specialists.records[0][85] === 1 &&
              w.specialists.records[0][130] === 0 &&
              w.specialists.records[0][88] === 0 &&
              !(w.specialists.records[0][87] & 3),
            reason: w.actors[0].reason,
            counts: w.players[0].completed,
          };
        });
        if (status.phase !== "active" || status.idle) break;
      }
      assert.notEqual(status.phase, "blocked", JSON.stringify(status));
      assert.ok(
        status.idle || status.phase === "result",
        JSON.stringify(status),
      );
      builds.push({ label, point: [x, y], status });
    }
    await page
      .getByRole("button", { name: "View result", exact: true })
      .waitFor();
    const beforeResult = await page.evaluate(() => {
      const w = window.CR.inspect().campaign.world;
      return {
        phase: w.phase,
        result: w.result.phase,
        mission: w.missionId,
        progress: w.players[0].progress,
      };
    });
    assert.equal(beforeResult.result, "victory-notification");
    await page.screenshot({
      path: resolve(out, `${viewport.width}-result.png`),
    });
    await page
      .getByRole("button", { name: "View result", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue to next mission", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Deploy specialists", exact: true })
      .waitFor();
    const carried = await page.evaluate(() => {
      const w = window.CR.inspect().campaign.world;
      return {
        mission: w.missionId,
        phase: w.phase,
        progress: w.players[0].progress,
        selected: w.actors.map((a) => a.blueprintIndex),
        funds: w.players[0].funds,
        mules: w.ecology.mules.filter((m) => m.native[6] !== 0).length,
        plants: w.ecology.plants.filter((p) => p.active).length,
        zones: w.missionPrefix[0x34b8],
      };
    });
    assert.deepEqual(
      {
        mission: carried.mission,
        phase: carried.phase,
        progress: carried.progress,
        mules: carried.mules,
        plants: carried.plants,
        zones: carried.zones,
      },
      {
        mission: 2,
        phase: "briefing",
        progress: 1,
        mules: 4,
        plants: 25,
        zones: 1,
      },
    );
    await page
      .getByRole("button", { name: "Deploy specialists", exact: true })
      .click();
    await page.evaluate(() => window.CR.advanceCampaign(250));
    await page.waitForFunction(() => {
      const c = window.CR.inspect().campaign;
      return c.renderErrors.length > 0 || c.renderedTick === c.world.tick;
    });
    const krell = await page.evaluate(() => {
      const c = window.CR.inspect().campaign;
      return {
        phase: c.world.phase,
        renderErrors: c.renderErrors,
        pure: window.CR.renderPurity(),
      };
    });
    assert.equal(krell.phase, "active");
    assert.deepEqual(krell.renderErrors, []);
    assert.equal(krell.pure, true);
    if (viewport.width < viewport.height)
      await page.getByRole("button", { name: "Units", exact: true }).click();
    await page.getByRole("button", { name: /Geneticist · skill/ }).click();
    const target = page.getByRole("combobox", {
      name: "Mule target",
      exact: true,
    });
    assert.equal(await target.locator("option").count(), 4);
    await target.selectOption("0");
    const activate = page.getByRole("button", {
      name: "Capture / research",
      exact: true,
    });
    if (viewport.width < 1000) await activate.tap();
    else await activate.click();
    await page.evaluate(() => window.CR.advanceCampaign(1));
    const geneticist = await page.evaluate(() => {
      const w = window.CR.inspect().campaign.world,
        a = w.actors.find((a) => w.specialists.bindings[a.id]?.category === 2),
        n = w.specialists.records[a.id];
      return {
        actor: a.id,
        state: n[85],
        task: n[126],
        target: n[127] | (n[128] << 8),
        errors: w.notices.filter((n) => n.severity === "error"),
      };
    });
    assert.equal(geneticist.state, 11);
    assert.equal(geneticist.task, 0);
    assert.equal(geneticist.target, 0);
    assert.deepEqual(geneticist.errors, []);
    await page.getByRole("button", { name: /Botanist · skill/ }).click();
    const collect = page.getByRole("button", {
      name: "Collect plant samples nearby",
      exact: true,
    });
    if (viewport.width < 1000) await collect.tap();
    else await collect.click();
    await page.evaluate(() => window.CR.advanceCampaign(1));
    const botanist = await page.evaluate(() => {
      const w = window.CR.inspect().campaign.world,
        a = w.actors.find((a) => w.specialists.bindings[a.id]?.category === 1),
        n = w.specialists.records[a.id];
      return {
        state: n[85],
        task: n[126],
        working: !!(n[88] & 1),
        ordered: w.notices.some(
          (n) => n.text === "Botanist work ordered" && n.entityId === a.id,
        ),
        errors: w.notices.filter((n) => n.severity === "error"),
      };
    });
    assert.equal(botanist.ordered, true);
    assert.ok([1, 8, 10].includes(botanist.state));
    if (botanist.working) assert.equal(botanist.task, 0);
    else assert.equal(botanist.task, 255);
    assert.deepEqual(botanist.errors, []);
    // --- Krell: real unlock order, Mule production and herding to the zone.
    // Valid Krell sites, each offset from the mission anchor and mutually clear.
    const SITES = {
      Extractor: [4.5, 58.5],
      "First Stage Distributor": [3.5, 63.5],
      "Photon Processor": [9.5, 59.5],
      Genepod: [8.5, 64.5],
    };
    const CELLS = [[4.5, 58.5], [3.5, 63.5], [9.5, 59.5], [8.5, 64.5], [5.5, 58.5]];
    const readyEngineer = async () => {
      for (let i = 0; i < 25; i++) {
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
    const buildKrell = async (label, selector) => {
      if (!(await readyEngineer())) return "no-engineer";
      if (viewport.width < viewport.height)
        await page.getByRole("button", { name: "Units", exact: true }).click();
      await page.getByRole("button", { name: /Engineer · skill/ }).click();
      if (viewport.width < viewport.height)
        await page.getByRole("button", { name: "Build", exact: true }).click();
      const enabled = await page.evaluate((name) => {
        const buttons = [...document.querySelectorAll("#campaign-build button")];
        const b = buttons.find((n) => n.textContent.startsWith(name + " · "));
        return !!b && !b.disabled;
      }, label);
      if (!enabled) return "locked";
      const preferred = SITES[label] ? [SITES[label], ...CELLS] : CELLS;
      for (const [x, y] of preferred) {
        if (viewport.width < viewport.height)
          await page.getByRole("button", { name: "Build", exact: true }).click();
        await page
          .getByRole("button", { name: new RegExp(`^${label} ·`) })
          .click();
        const at = await page.evaluate(([px, py]) => window.CR.project(px, py), [x, y]);
        if (!at) continue;
        if (viewport.width < 1000) await page.touchscreen.tap(at.x, at.y);
        else await page.mouse.click(at.x, at.y);
        for (let i = 0; i < 12; i++) {
          await page.evaluate(() => window.CR.advanceCampaign(400));
          const done = await page.evaluate(
            (s) => window.CR.inspect().campaign.world.players[0].completed[s],
            selector,
          );
          if (done > 0) return "built";
        }
      }
      return "no-site";
    };
    // Replay export/import and restart checks are Exceland-era coverage and
    // restart the mission; the Krell run skips them to stay within budget.
    let replayed = null,
      restarted = null,
      downloadFailure = null;
    if (!process.env.CAMPAIGN_SKIP_REPLAY) {
      await page
        .getByRole("button", { name: "Save / load", exact: true })
        .click();
      await page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          if (blob.type === "application/json")
            window.__campaignExport = blob.text();
          return original(blob);
        };
      });
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export campaign replay", exact: true })
        .click();
      const replayPath = resolve(out, `${viewport.width}-replay.json`);
      const exported = await download,
        downloadFailure = await exported.failure();
      if (downloadFailure === null) await exported.saveAs(replayPath);
      else {
        // This managed Chrome also cancels a minimal asset-free Blob download.
        // Preserve that tooling result and test the actual UI-generated payload.
        writeFileSync(
          replayPath,
          await page.evaluate(() => window.__campaignExport),
        );
      }
      const replay = JSON.parse(readFileSync(replayPath, "utf8"));
      assert.equal(replay.final.result, "running");
      assert.equal(typeof replay.sourceDirty, "boolean");
      assert.ok(replay.commands.some((e) => e.type === "continue"));
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Resume", exact: true })
        .click();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      const chooser = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "Import campaign replay", exact: true })
        .click();
      await (await chooser).setFiles(replayPath);
      await page.waitForFunction(
        () => window.CR.inspect().campaign?.world.missionId === 2,
      );
      const replayed = await page.evaluate(() => {
        const c = window.CR.inspect().campaign;
        return {
          tick: c.world.tick,
          phase: c.world.phase,
          renderErrors: c.renderErrors,
        };
      });
      assert.equal(replayed.tick, replay.final.tick);
      assert.equal(replayed.phase, "active");
      assert.deepEqual(replayed.renderErrors, []);
      await page.getByRole("button", { name: "Restart", exact: true }).click();
      await page
        .getByRole("button", { name: "Deploy specialists", exact: true })
        .waitFor();
      const restarted = await page.evaluate(() => {
        const w = window.CR.inspect().campaign.world;
        return {
          mission: w.missionId,
          frame: w.frame,
          progress: w.players[0].progress,
          phase: w.phase,
        };
      });
      assert.deepEqual(restarted, {
        mission: 2,
        frame: 0,
        progress: 1,
        phase: "briefing",
      });
      await page
        .getByRole("button", { name: "Deploy specialists", exact: true })
        .click();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    results.push({
      viewport,
      state,
      final,
      builds,
      beforeResult,
      carried,
      krell,
      geneticist,
      replayed,
      restarted,
      downloadFailure,
      errors,
      requests,
    });
    // Krell play-through is gated so the Exceland replay/restart coverage can
    // run on its own within the 420s execution budget.
    let krellSteps = [];
    let krellVictory = null;
    if (!process.env.CAMPAIGN_SKIP_KRELL) {
      krellSteps = [];
      // Building prerequisites are pre[0]=3 and pre[3]=11, so Photon is not needed.
      for (const [label, selector] of [
        ["Extractor", 11],
        ["First Stage Distributor", 3],
        ["Genepod", 0],
      ]) {
        const outcome = await buildKrell(label, selector);
        krellSteps.push({ label, selector, outcome });
        if (outcome === "locked") break;
      }
  
      const krellRounds = [];
      // Portrait layouts collapse the sidebar into Mission/Units/Build/Economy tabs.
      const portrait = viewport.width < viewport.height;
      const tabIndex = { Mission: 0, Units: 1, Build: 2, Economy: 3, Alerts: 4 };
      const openTab = async (name) => {
        if (!portrait) return;
        await page.getByRole("button", { name, exact: true }).click();
        await page
          .locator(".sidebar section")
          .nth(tabIndex[name])
          .waitFor({ state: "visible" });
      };
      const maxRounds = Number(process.env.KRELL_ROUNDS || 14);
      for (let round = 0; round < maxRounds; round++) {
        const state = await page.evaluate(() => {
          const w = window.CR.inspect().campaign.world;
          const raw = w.players[0].raw[13];
          return {
            result: w.result.phase,
            funds: w.players[0].funds,
            score: raw < 0 ? raw + 256 : raw,
            mules: w.ecology.mules
              .filter(
                (m) =>
                  m.native[6] === 1 && m.native[24] === 0 && m.native[0x5e] < 24,
              )
              .map((m) => ({
                x: (m.native[7] | (m.native[8] << 8)) / 256,
                y: (m.native[9] | (m.native[10] << 8)) / 256,
              })),
          };
        });
        krellRounds.push({
          round,
          funds: state.funds,
          score: state.score,
          mules: state.mules.length,
          result: state.result,
        });
        if (state.result !== "running") {
          krellVictory = {
            ...state,
            objectives: await page.evaluate(() =>
              [...document.querySelectorAll("#campaign-objectives .objective")].map(
                (n) => ({ text: n.textContent, complete: n.classList.contains("complete") }),
              ),
            ),
          };
          break;
        }
        await openTab("Economy");
        const produce = page.getByRole("button", { name: /^Produce Mule/ });
        const produceCount = await produce.count();
        if (produceCount > 0 && state.funds > 75) {
          // Produce several Mules per round: the zone needs enough live bodies and
          // a single order per round finishes too late to beat the mission timer.
          for (let k = 0; k < 3; k++) {
            const funds = await page.evaluate(
              () => window.CR.inspect().campaign.world.players[0].funds,
            );
            if (funds <= 75) break;
            try {
              if (viewport.width < 1000) await produce.first().tap({ timeout: 5000 });
              else await produce.first().click({ timeout: 5000 });
              await page.evaluate(() => window.CR.advanceCampaign(420));
            } catch (e) {
              krellRounds.push({ produceError: String(e).slice(0, 80) });
              break;
            }
          }
        } else {
          krellRounds.push({ produceSkipped: produceCount, funds: state.funds });
        }
        // Real UI path: select the Mule in the panel, centre the camera on the
        // marked zone with "Show zone 1", then tap the zone cell. The small offset
        // avoids an exact-target raycast degeneracy where the ray meets the camera
        // focus point precisely and the ground intersection is missed.
        await openTab("Units");
        const muleButton = page.getByRole("button", { name: /^Mule \d+ · health/ });
        const muleCount = await muleButton.count();
        await openTab("Mission");
        const showZone = page.getByRole("button", { name: /^Show zone 1$/ });
        const tapAt = async (x, y) => {
          if (viewport.width < 1000) await page.touchscreen.tap(x, y);
          else await page.mouse.click(x, y);
        };
        for (let i = 0; i < muleCount; i++) {
          try {
            await openTab("Units");
            if (viewport.width < 1000) await muleButton.nth(i).tap({ timeout: 5000 });
            else await muleButton.nth(i).click({ timeout: 5000 });
            await openTab("Mission");
            if (viewport.width < 1000) await showZone.tap({ timeout: 5000 });
            else await showZone.click({ timeout: 5000 });
          } catch {
            continue;
          }
          const zone = await page.evaluate(() => window.CR.project(1, 95));
          if (!zone) continue;
          const readNotice = () =>
            page.evaluate(() => document.querySelector("#campaign-notice")?.textContent ?? "");
          const before = await readNotice();
          // The camera centres exactly on the marked zone; a ray through the exact
          // centre meets the ground at the focus point and the intersection is
          // missed. Walk a few small offsets until the order is accepted.
          for (const [dx, dy] of [[8, 8], [24, 24], [48, 48], [80, 80]]) {
            await tapAt(zone.x + dx, zone.y + dy);
            await page.evaluate(() => window.CR.advanceCampaign(30));
            if ((await readNotice()) !== before) break;
          }
          if (process.env.KRELL_DEBUG) {
            const probe = await page.evaluate(([x, y]) => {
              const el = document.elementFromPoint(x, y);
              const cv = document.querySelector("#campaign-world canvas");
              const r = cv?.getBoundingClientRect();
              return {
                hit: el ? `${el.tagName}.${el.className}` : null,
                canvas: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
                notice: document.querySelector("#campaign-notice")?.textContent ?? "",
                sel: document.querySelector("#campaign-selection")?.textContent ?? "",
              };
            }, [zone.x + 4, zone.y + 4]);
            krellRounds.push({ tapProbe: { zone, before, ...probe } });
          }
        }
        krellRounds.push({ muleButtons: muleCount });
        await page.evaluate(() => window.CR.advanceCampaign(500));
      }
      console.log(JSON.stringify({ krellSteps, krellRounds, krellVictory }));
      assert.ok(krellVictory, `Krell did not reach a result: ${JSON.stringify(krellSteps)}`);
      assert.equal(krellVictory.result, "victory-notification", JSON.stringify(krellVictory));
      // Recovered source wins on the marked-zone ranking once the zone quota is
      // exhausted (mission-objectives scan: terrainCount === field34b9 picks the
      // best score). The terrain-score goal is a display threshold, not the win
      // predicate, and the player record is reset on the result transition, so
      // assert the completed objective row rather than a fixed score value.
      assert.ok(
        krellVictory.objectives.some((o) => o.complete),
        JSON.stringify(krellVictory),
      );
      await page.getByRole("button", { name: "View result", exact: true }).click();
      await page
        .getByRole("button", { name: "Continue to next mission", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Deploy specialists", exact: true })
        .waitFor();
      const krellCarry = await page.evaluate(() => {
        const w = window.CR.inspect().campaign.world;
        return {
          mission: w.missionId,
          frame: w.frame,
          progress: w.players[0].progress,
          phase: w.phase,
        };
      });
      assert.deepEqual(krellCarry, {
        mission: 3,
        frame: 0,
        progress: 2,
        phase: "briefing",
      });
      await page
        .getByRole("button", { name: "Deploy specialists", exact: true })
        .click();
      await page.screenshot({
        path: resolve(out, `${viewport.width}-krell.png`),
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        artifactSha256: createHash("sha256")
          .update(readFileSync(artifact))
          .digest("hex"),
        canonicalAccepted: 0,
        results,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify(
    results.map((r) => ({
      viewport: r.viewport,
      completed: r.final.completed,
      pure: r.final.pure,
    })),
  ),
);
