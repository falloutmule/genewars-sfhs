import { chromium } from "playwright-core";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const privateBuild = process.argv.includes("--private");
const artifact = resolve(
  privateBuild ? "dist/genewars-sfhs.html" : "dist/genewars-synthetic.html",
);
const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find(existsSync);
if (!executablePath && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  throw new Error("Set CHROME_PATH to a Chromium executable");
const out = resolve(
  privateBuild ? ".private/browser-private" : "test-results/browser-synthetic",
);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    executablePath || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: [
    "--allow-file-access-from-files",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 915, height: 412 },
    { width: 412, height: 915 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 1000,
      isMobile: viewport.width < 1000,
    });
    const page = await context.newPage(),
      errors = [],
      requests = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (!/^(?:file:|data:|blob:)/.test(r.url())) requests.push(r.url());
    });
    await context.route(/https?:\/\//, (route) => route.abort());
    await context.setOffline(true);
    await page.goto(pathToFileURL(artifact).href, { waitUntil: "load" });
    try {
      await page
        .getByRole("button", { name: "Campaign atlas", exact: true })
        .waitFor({ timeout: 30000 });
    } catch (e) {
      console.log(
        JSON.stringify({
          errors,
          requests,
          body: await page.locator("body").innerText(),
        }),
      );
      await page.screenshot({ path: resolve(out, "boot-failure.png") });
      throw e;
    }
    const check = await page.evaluate(() => window.CR.runFullSelfCheck());
    assert.equal(check.pass, true);
    assert.equal(
      (await page.evaluate(() => window.CR.inspect())).world,
      null,
      "selfcheck leaked a world",
    );
    await page
      .getByRole("button", {
        name: "Exceland construction workbench",
        exact: true,
      })
      .click();
    await page.locator(".world canvas").first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.CR.renderPurity()), true);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const at = await page.evaluate(() => window.CR.inspect().world.tick);
    await page.waitForTimeout(250);
    assert.equal(
      (await page.evaluate(() => window.CR.inspect())).world.tick,
      at,
    );
    await page.selectOption("#speed", "4");
    // DOM pointer and touch controls must work at each layout.
    await page
      .getByRole("button", { name: "Select specialists", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => window.CR.inspect())).selection.length,
      2,
    );
    if (viewport.width === 1440) {
      await page.keyboard.press("Control+1");
      await page.keyboard.press("2");
      await page.keyboard.press("1");
      assert.equal(
        (await page.evaluate(() => window.CR.inspect())).selection.length,
        2,
      );
    }
    await page.getByRole("button", { name: "Saves", exact: true }).click();
    await page
      .getByRole("button", { name: "Save slot 1", exact: true })
      .click();
    await page.getByRole("button", { name: "Saves", exact: true }).click();
    await page
      .getByRole("button", { name: "Load slot 1", exact: true })
      .click();
    await page.locator("#world").waitFor();
    assert.equal((await page.evaluate(() => window.CR.inspect())).paused, true);
    await page.screenshot({
      path: resolve(out, `world-${viewport.width}x${viewport.height}.png`),
    });
    const layout = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth > innerWidth,
      minimapWidth: document.querySelector("#minimap").getBoundingClientRect()
        .width,
      buttons: [...document.querySelectorAll(".topbar button")].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: b.textContent,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      }),
    }));
    assert.equal(layout.scroll, false);
    assert(
      layout.buttons.every(
        (b) => b.h >= 44 && b.x >= 0 && b.x + b.w <= viewport.width + 1,
      ),
    );
    assert(layout.minimapWidth <= 130, "minimap obscures the game view");
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const inspect = await page.evaluate(() => window.CR.inspect());
    assert(inspect.renderer.triangles > 0);
    if (viewport.width === 1440 || viewport.width === 915) {
      // Exercise the shipped UI, not a debug command injection API.
      await page
        .getByRole("button", { name: "Select specialists", exact: true })
        .click();
      for (const [label, x, y, selector, count] of [
        ["Extractor", 83, 54, 11, 1],
        ["First Stage Distributor", 87, 54, 3, 1],
        ["Photon Processor", 81, 56, 6, 1],
        ["Photon Processor", 81, 58, 6, 2],
        ["Photon Processor", 83, 58, 6, 3],
      ]) {
        await page.locator("#build button").filter({ hasText: label }).click();
        const p = await page.evaluate(
          ([x, y]) => window.CR.project(x + 0.5, y + 0.5),
          [x, y],
        );
        assert(
          p &&
            p.x > 0 &&
            p.x < viewport.width &&
            p.y > 60 &&
            p.y < viewport.height - 40,
          "site outside world",
        );
        if (viewport.width === 915) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
        const after = await page.evaluate(() => window.CR.inspect());
        if (!after.world.pending.length) {
          console.log(
            JSON.stringify({
              label,
              p,
              selection: after.selection,
              notice: await page.locator("#notice").innerText(),
              world: after.world,
            }),
          );
          await page.screenshot({ path: resolve(out, "input-failure.png") });
        }
        assert(after.world.pending.length > 0, "pointer command not queued");
        if ((await page.evaluate(() => window.CR.inspect())).paused)
          await page
            .getByRole("button", { name: "Resume", exact: true })
            .click();
        await page.waitForFunction(
          ([selector, count]) =>
            (window.CR.inspect().world.completed[selector] || 0) >= count,
          [selector, count],
          { timeout: 7000 },
        );
        await page.getByRole("button", { name: "Pause", exact: true }).click();
      }
      const end = await page.evaluate(() => window.CR.inspect());
      assert.equal(end.world.status, "workbench-complete");
      assert.equal(end.world.goop, 200);
      await page.screenshot({
        path: resolve(out, `construction-${viewport.width}.png`),
      });
      if (privateBuild) {
        await page
          .getByRole("button", { name: "Inspect Krell", exact: true })
          .click();
        await page.waitForFunction(() => window.CR.inspect().world === null);
        assert.match(await page.locator("#mission-name").innerText(), /Krell/);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    results.push({
      viewport,
      check,
      layout,
      constructionPath:
        viewport.width !== 412 ? "completed-by-touch-or-mouse" : "not-run",
      renderer: inspect.renderer,
      packKind: inspect.packKind,
      missionCount: inspect.missionCount,
      assetCount: inspect.assetCount,
      soundCount: inspect.soundCount,
      errors,
      networkRequests: requests,
    });
    await context.close();
  }
  const report = {
    status: "pass",
    artifact: artifact.split(/[\\/]/).at(-1),
    artifactSha256: createHash("sha256")
      .update(readFileSync(artifact))
      .digest("hex"),
    privateBuild,
    results,
    realPhoneAcceptance: false,
  };
  writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
