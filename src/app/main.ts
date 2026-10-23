/* AI-SAFE SINGLE-FILE CONSTITUTION
 * Named SECTION blocks; bump SAVE_VERSION and migrate for schema changes.
 * INPUT → ACTIONS → SIMULATION → RENDER. Render must not mutate gameplay state.
 * Scene lifecycle ownership; centralized CONFIG / DEBUG / URL flags.
 * No runtime external dependencies. Harness state isolation.
 * Smoke tests: window.CR.runFullSelfCheck().
 */
import "../ui/style.css";
import { PackSchema, type Pack, type Mission } from "../content/types";
import { syntheticPack } from "../content/synthetic";
import { openCampaign, type CampaignController } from "./campaign";
import {
  recoverCampaign,
  loadCampaign,
  saveCampaign,
  replayCampaign,
  type CampaignReplay,
  type CampaignSave,
} from "../sim/campaign/persistence";
import { CampaignDatabase } from "../platform/campaign-storage";
import { FixedClock } from "../platform/clock";
import { connectInput } from "../platform/input";
import { Stage } from "../render/stage";
import {
  available,
  BUILDINGS,
  createWorld,
  queue,
  step,
  type Selector,
} from "../sim/world";
import type { Command, World } from "../sim/schema";
import { checksum } from "../sim/checksum";
import { load, recover, save, storeRecovery } from "../sim/save";
import {
  captureCommand,
  record,
  replay,
  seal,
  type Replay,
} from "../sim/replay";

// SECTION CONFIG
const app = document.querySelector<HTMLElement>("#app")!;
const CONFIG = { version: "0.1.0-workbench", autosaveTicks: 300 };
let pack: Pack,
  contentHash = "synthetic-v1",
  stage: Stage | null = null,
  world: World | null = null,
  mission: Mission;
let campaign: CampaignController | null = null;
let clock = new FixedClock(),
  selection = new Set<number>(),
  placing: Selector | null = null,
  recording: Replay | null = null;
let releaseInput: (() => void) | null = null,
  raf = 0,
  last = 0,
  lastHud = -1;
const groups = new Map<string, number[]>(),
  bookmarks = new Map<string, { x: number; y: number }>();
const volumes = { music: 0.6, voice: 0.8, ambience: 0.6, effects: 0.7 };
let playing: HTMLAudioElement | null = null;
const $ = (s: string) => app.querySelector<HTMLElement>(s)!;
const text = (s: string, v: string) => {
  const node = app.querySelector(s);
  if (node) node.textContent = v;
};
function button(
  label: string,
  action: () => void,
  parent: HTMLElement,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", action);
  parent.append(b);
  return b;
}
function status(message: string): void {
  text("#notice", message);
}
function teardown(): void {
  campaign?.stop();
  campaign = null;
  cancelAnimationFrame(raf);
  releaseInput?.();
  releaseInput = null;
  stage?.dispose();
  stage = null;
  playing?.pause();
  playing = null;
}
function showError(error: unknown): void {
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = error instanceof Error ? error.message : String(error);
  (app.querySelector(".dialog-inner") || app).append(p);
}
function download(name: string, body: string): void {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function upload(callback: (text: string) => void): void {
  const i = document.createElement("input");
  i.type = "file";
  i.accept = ".json";
  i.addEventListener("change", async () => {
    try {
      const f = i.files?.[0];
      if (f && f.size <= 10_000_000) callback(await f.text());
      else throw new Error("File missing or exceeds 10 MB");
    } catch (e) {
      showError(e);
    }
  });
  i.click();
}
function dialog(title: string): HTMLElement {
  const old = app.querySelector(".dialog");
  old?.remove();
  const d = document.createElement("div");
  d.className = "dialog";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  const inner = document.createElement("div");
  inner.className = "dialog-inner";
  const h = document.createElement("h2");
  h.textContent = title;
  inner.append(h);
  button("Close", () => d.remove(), inner);
  d.append(inner);
  app.append(d);
  return inner;
}
function snapshot(): string {
  if (!world) throw new Error("No active world");
  return save(world, {
    paused: clock.paused,
    speed: clock.speed,
    accumulator: clock.accumulator,
  });
}
function autosave(): void {
  if (world)
    try {
      storeRecovery(localStorage, snapshot());
    } catch {
      status("Recovery save unavailable. Export a save to keep this session.");
    }
}

// SECTION MENUS
function menu(): void {
  teardown();
  world = null;
  selection.clear();
  app.innerHTML =
    '<div class="landing"><div class="landing-inner"><p class="eyebrow">1996 → Browser · Direct conversion</p><h1>GENEWARS</h1><p class="badge">Campaign development ·0/24 missions accepted</p><p>Original worlds, original artwork. A modern conversion built from your locally owned files.</p><p id="variant" class="muted"></p><div class="actions" id="menu-actions"></div><p id="coverage"></p><p class="help">The original campaign path initializes from mission data. This development build is still being verified. The separate construction workbench remains available as a developer tool.</p><p id="notice" role="status"></p></div></div>';
  if (pack.assets.TITLESCR)
    $(".landing").style.setProperty(
      "--title-art",
      `url("${pack.assets.TITLESCR.image}")`,
    );
  text("#variant", pack.source.variant);
  text(
    "#coverage",
    `${pack.missions.length} maps · ${Object.keys(pack.assets).length} visual resources · ${Object.keys(pack.sounds).length} audio records`,
  );
  const actions = $("#menu-actions");
  const campaignButton = button(
    "Start original campaign",
    () => void startCampaign(),
    actions,
  );
  campaignButton.disabled =
    pack.schemaVersion !== 2 || !pack.missions[0].startup;
  button(
    "Resume campaign recovery",
    () => {
      void (async () => {
        for (const text of await new CampaignDatabase().recovery())
          if (text)
            try {
              await startCampaign(loadCampaign(text, contentHash));
              return;
            } catch {}
        const old = recoverCampaign(localStorage, contentHash);
        if (old) {
          await startCampaign(old);
          return;
        }
        throw new Error("No compatible campaign recovery save");
      })().catch(showError);
    },
    actions,
  );
  button("Campaign atlas", campaignAtlas, actions);
  button(
    "Import campaign save",
    () =>
      upload((text) => {
        try {
          void startCampaign(loadCampaign(text, contentHash));
        } catch (e) {
          showError(e);
        }
      }),
    actions,
  );
  button(
    "Import campaign replay",
    () =>
      upload((text) => {
        try {
          const replay = JSON.parse(text) as CampaignReplay;
          const replayed = replayCampaign(replay, pack, contentHash);
          void startCampaign(
            loadCampaign(
              saveCampaign(replayed, {
                paused: true,
                speed: 1,
                accumulator: 0,
              }),
              contentHash,
            ),
          );
        } catch (e) {
          showError(e);
        }
      }),
    actions,
  );
  button(
    "Exceland construction workbench",
    () => void start(pack.missions[0], true),
    actions,
  );
  button("Asset browser", assetBrowser, actions);
  button(
    "Resume recovery save",
    () => {
      try {
        const s = recover(localStorage, contentHash);
        if (!s) throw new Error("No compatible recovery save");
        void restore(s);
      } catch (e) {
        showError(e);
      }
    },
    actions,
  );
  button(
    "Import save",
    () =>
      upload((s) => {
        try {
          void restore(load(s, contentHash));
        } catch (e) {
          showError(e);
        }
      }),
    actions,
  );
  button(
    "Import replay",
    () =>
      upload((s) => {
        try {
          const w = replay(JSON.parse(s), contentHash);
          void start(pack.missions.find((m) => m.id === w.missionId)!, true, w);
        } catch (e) {
          showError(e);
        }
      }),
    actions,
  );
}
async function startCampaign(restored?: CampaignSave): Promise<void> {
  teardown();
  world = null;
  try {
    campaign = await openCampaign(app, pack, contentHash, menu, restored);
  } catch (e) {
    menu();
    showError(e);
  }
}
function campaignAtlas(): void {
  const d = dialog("Original campaign atlas"),
    p = document.createElement("p");
  p.textContent =
    "All imported maps are available for inspection. Mission completion and transitions have not passed acceptance.";
  d.append(p);
  const list = document.createElement("div");
  list.className = "list";
  d.append(list);
  for (const m of pack.missions)
    button(
      `${m.id.toString().padStart(2, "0")} · ${m.name}`,
      () => void start(m, false),
      list,
    );
}
function assetBrowser(): void {
  const d = dialog("Imported asset browser"),
    search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Find artwork or an audio record";
  search.setAttribute("aria-label", "Search assets");
  d.append(search);
  const list = document.createElement("select");
  list.size = 6;
  list.style.width = "100%";
  d.append(list);
  const preview = document.createElement("canvas");
  preview.width = 512;
  preview.height = 256;
  preview.className = "art-preview";
  d.append(preview);
  const info = document.createElement("p"),
    slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.value = "0";
  slider.setAttribute("aria-label", "Animation frame");
  d.append(slider, info);
  const entries = [
    ...Object.keys(pack.assets).map((k) => "art:" + k),
    ...Object.keys(pack.sounds).map((k) => "audio:" + k),
  ];
  const filter = () => {
    list.replaceChildren();
    for (const key of entries.filter((k) =>
      k.toLowerCase().includes(search.value.toLowerCase()),
    )) {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = key;
      list.append(o);
    }
  };
  filter();
  search.addEventListener("input", filter);
  const show = async () => {
    const [kind, ...parts] = list.value.split(":"),
      key = parts.join(":");
    playing?.pause();
    if (kind === "audio") {
      playing = new Audio(pack.sounds[key]);
      playing.volume = volumes.voice;
      try {
        await playing.play();
      } catch (e) {
        info.textContent = String(e);
      }
      slider.hidden = true;
      return;
    }
    const asset = pack.assets[key];
    if (!asset) return;
    slider.hidden = false;
    slider.max = String((asset.frames?.length || 1) - 1);
    const ctx = preview.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 256);
    ctx.imageSmoothingEnabled = false;
    const image = new Image();
    image.src = asset.image;
    await image.decode();
    const frame = asset.frames?.[Number(slider.value)];
    if (frame && asset.sprites) {
      for (const [ref, x, y, flags] of frame.components) {
        const r = asset.sprites[ref];
        ctx.save();
        ctx.translate(256 + x, 160 + y);
        ctx.scale(flags & 1 ? -1 : 1, flags & 2 ? -1 : 1);
        ctx.drawImage(image, ...r, 0, 0, r[2], r[3]);
        ctx.restore();
      }
    } else
      ctx.drawImage(
        image,
        0,
        0,
        Math.min(image.width, 512),
        Math.min(image.height, 256),
      );
    info.textContent = `${key} · ${asset.frames?.length || 0} frames · ${asset.animations?.length || 0} animations · ${asset.paletteMode || asset.kind}. Preview timing is diagnostic.`;
  };
  list.addEventListener("change", () => {
    slider.value = "0";
    void show();
  });
  slider.addEventListener("input", () => void show());
  button(
    "Import diagnostics",
    () => {
      const p = document.createElement("pre");
      p.style.whiteSpace = "pre-wrap";
      p.textContent = pack.unknown
        .map((u) => `${u.path}: ${u.reason}`)
        .join("\n");
      d.append(p);
    },
    d,
  );
  button("Audio levels", audioSettings, d);
  if (list.options.length) {
    list.selectedIndex = 0;
    void show();
  }
}
function audioSettings(): void {
  const d = dialog("Audio levels");
  for (const key of Object.keys(volumes) as (keyof typeof volumes)[]) {
    const row = document.createElement("label");
    row.className = "row";
    row.textContent = key;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "1";
    input.step = ".05";
    input.value = String(volumes[key]);
    input.setAttribute("aria-label", key + " volume");
    input.addEventListener("input", () => {
      volumes[key] = Number(input.value);
      if (playing) playing.volume = volumes.voice;
    });
    row.append(input);
    d.append(row);
  }
  const p = document.createElement("p");
  p.textContent =
    "Audio is available for inspection. Gameplay cues, music and subtitle mapping are not integrated.";
  d.append(p);
}
function saves(): void {
  const d = dialog("Save and recovery");
  for (let slot = 1; slot <= 3; slot++) {
    const row = document.createElement("div");
    row.className = "row";
    d.append(row);
    button(
      `Save slot ${slot}`,
      () => {
        try {
          localStorage.setItem("gw:manual:" + slot, snapshot());
          status("Manual save stored");
          d.parentElement?.remove();
        } catch (e) {
          showError(e);
        }
      },
      row,
    );
    button(
      `Load slot ${slot}`,
      () => {
        try {
          const s = localStorage.getItem("gw:manual:" + slot);
          if (!s) throw new Error("Empty slot");
          void restore(load(s, contentHash));
        } catch (e) {
          showError(e);
        }
      },
      row,
    );
  }
  button("Export save", () => download("genewars-save.json", snapshot()), d);
  button(
    "Import save",
    () =>
      upload((s) => {
        try {
          void restore(load(s, contentHash));
        } catch (e) {
          showError(e);
        }
      }),
    d,
  );
  button(
    "Export replay",
    () => {
      if (world && recording)
        download(
          "genewars-replay.json",
          JSON.stringify(seal(recording, world)),
        );
    },
    d,
  );
}
async function restore(s: ReturnType<typeof load>): Promise<void> {
  await start(
    pack.missions.find((m) => m.id === s.world.missionId)!,
    true,
    s.world,
  );
  clock.paused = s.session.paused;
  clock.speed = s.session.speed;
  clock.accumulator = s.session.accumulator;
  ($("#speed") as HTMLSelectElement).value = String(clock.speed);
  hud();
}

// SECTION INPUT → ACTIONS
function issue(x: number, y: number, queued: boolean): void {
  if (!world) return;
  const a = world.specialists.find((a) => selection.has(a.id));
  if (!a) {
    status("Select a specialist first");
    return;
  }
  const common = {
    tick: world.tick,
    playerId: 0 as const,
    sequence: world.nextSequence,
  };
  const c: Command = placing
    ? {
        ...common,
        type: "construct",
        actorId: a.id,
        selector: placing,
        x,
        y,
        queued,
      }
    : {
        ...common,
        type: "move",
        actorIds: [...selection].filter((id) =>
          world!.specialists.some((a) => a.id === id),
        ),
        x,
        y,
        queued,
      };
  try {
    queue(world, c);
    if (recording) captureCommand(recording, world, c);
    status(
      `${placing ? BUILDINGS[placing].name : "Move"} order queued at ${x}, ${y}${clock.paused ? " · resumes when unpaused" : ""}`,
    );
    placing = null;
    hud();
  } catch (e) {
    status(String(e));
  }
}
async function start(
  m: Mission,
  workbench: boolean,
  restored?: World,
): Promise<void> {
  teardown();
  mission = m;
  clock = new FixedClock();
  selection = new Set(workbench ? [1] : []);
  placing = null;
  lastHud = -1;
  world = workbench
    ? restored
      ? structuredClone(restored)
      : createWorld(m, contentHash, pack.kind === "synthetic")
    : null;
  recording = world ? record(world) : null;
  app.innerHTML =
    '<div class="game"><header class="topbar"><strong id="mission-name"></strong><button id="menu">Menu</button><button id="pause">Pause</button><select id="speed" aria-label="Simulation speed"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select><button id="save">Saves</button><button id="restart">Restart</button></header><div class="world" id="world"><div class="overlay-label">Drag to pan on touch · wheel/pinch to zoom</div><canvas id="minimap" class="minimap" width="128" height="128" aria-label="Minimap: tap to focus"></canvas></div><aside class="sidebar"><section><h2 id="panel-title"></h2><p id="briefing"></p><div id="objectives"></div></section><section><h2>Selection</h2><p id="selection"></p><div id="build"></div><button id="select-all">Select specialists</button><button id="select-type">Select same role</button></section><section><h2>Alerts</h2><div id="alerts" aria-live="polite"></div></section></aside><footer class="footer"><span class="badge">Development workbench</span><span id="resources"></span><span id="notice" class="status" role="status"></span><span class="muted">Space: pause · Shift: queue · Ctrl+1–9: groups · Alt+1–9: camera</span></footer></div>';
  text("#mission-name", `${m.id.toString().padStart(2, "0")} · ${m.name}`);
  text("#panel-title", workbench ? "Construction ledger" : "Mission briefing");
  text(
    "#briefing",
    workbench
      ? "Established build order. Development schedule; original running callbacks are pending."
      : m.briefing,
  );
  $("#menu").addEventListener("click", () => {
    autosave();
    menu();
  });
  $("#pause").addEventListener("click", () => {
    clock.paused = !clock.paused;
    hud();
  });
  $("#speed").addEventListener(
    "change",
    () =>
      (clock.speed = Number(
        ($("#speed") as HTMLSelectElement).value,
      ) as typeof clock.speed),
  );
  $("#save").addEventListener("click", () => {
    clock.paused = true;
    saves();
    hud();
  });
  $("#restart").addEventListener("click", () => void start(m, workbench));
  $("#select-all").addEventListener("click", () => {
    selection = new Set(world?.specialists.map((a) => a.id));
    hud();
  });
  $("#select-type").addEventListener("click", () => {
    const role = world?.specialists.find((a) => selection.has(a.id))?.role;
    selection = new Set(
      world?.specialists.filter((a) => a.role === role).map((a) => a.id),
    );
    hud();
  });
  for (const s of [11, 3, 6] as const)
    button(
      BUILDINGS[s].name,
      () => {
        placing = s;
        status(`Tap a site for ${BUILDINGS[s].name}`);
      },
      $("#build"),
    );
  try {
    stage = new Stage($("#world"), pack);
    await stage.setMission(m);
    releaseInput = connectInput(
      stage,
      () => world,
      (ids) => {
        selection = new Set(ids);
        hud();
      },
      issue,
      () => placing !== null,
    );
  } catch (e) {
    showError(e);
    return;
  }
  const map = $("#minimap") as HTMLCanvasElement,
    ctx = map.getContext("2d")!,
    im = ctx.createImageData(128, 128);
  m.cells.forEach((c, i) => {
    const n = Math.max(0, Math.min(255, c[0] / 24));
    im.data.set([n * 0.55, n * 0.8 + 25, n * 0.6 + 15, 255], i * 4);
  });
  ctx.putImageData(im, 0, 0);
  map.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const b = map.getBoundingClientRect();
    stage?.focus(
      ((e.clientX - b.left) / b.width) * 128,
      ((e.clientY - b.top) / b.height) * 128,
    );
  });
  if (!world) {
    $("#pause").setAttribute("disabled", "");
    $("#save").setAttribute("disabled", "");
    $("#build").classList.add("hidden");
    text(
      "#selection",
      "Map inspection. This mission runtime is not integrated.",
    );
  }
  hud();
  autosave();
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// SECTION SIMULATION → RENDER
function frame(now: number): void {
  const delta = Math.max(0, now - last);
  last = now;
  if (world) {
    clock.advance(delta, () => {
      if (!world) return;
      step(world);
      if (recording && world.tick % 100 === 0)
        recording.hashes.push([world.tick, checksum(world)]);
      if (world.tick % CONFIG.autosaveTicks === 0) autosave();
    });
    void stage?.sync(world, mission, selection);
    if (world.tick !== lastHud) {
      lastHud = world.tick;
      hud();
    }
  }
  stage?.render();
  raf = requestAnimationFrame(frame);
}
function hud(): void {
  if (!world) return;
  text("#pause", clock.paused ? "Resume" : "Pause");
  text("#resources", `GOOP ${world.goop} · tick ${world.tick}`);
  const ledger = $("#objectives");
  ledger.replaceChildren();
  for (const [s, target] of [
    [11, 1],
    [3, 1],
    [6, 3],
  ] as const) {
    const row = document.createElement("div");
    row.className =
      "objective" + ((world.completed[s] || 0) >= target ? " complete" : "");
    row.textContent = `${BUILDINGS[s].name} · ${world.completed[s] || 0}/${target}`;
    ledger.append(row);
  }
  if (world.status === "workbench-complete") {
    const p = document.createElement("p");
    p.textContent =
      "Construction predicate satisfied. Full mission outcome, power and GOOP running behavior still require integration.";
    ledger.append(p);
    button(
      "Inspect Krell",
      () => {
        const m = pack.missions.find((m) => m.id === 2);
        if (m) void start(m, false);
      },
      ledger,
    );
  }
  const chosen = [...world.specialists, ...world.buildings].filter((e) =>
    selection.has(e.id),
  );
  text(
    "#selection",
    chosen
      .map(
        (a) =>
          `${"role" in a ? a.role : BUILDINGS[a.selector].name}: ${a.reason}`,
      )
      .join(" · ") || "Tap an actor, or choose Select specialists.",
  );
  [...$("#build").querySelectorAll("button")].forEach((b, i) => {
    const s = ([11, 3, 6] as const)[i],
      reason = available(world!, s);
    b.disabled = !!reason;
    b.title =
      reason ||
      `Base cost ${BUILDINGS[s].cost} GOOP, less twice signed Engineer skill`;
    b.textContent = `${BUILDINGS[s].name} · ${BUILDINGS[s].cost}${reason ? " · locked" : ""}`;
  });
  const alerts = $("#alerts");
  alerts.replaceChildren();
  for (const a of [...world.alerts]
    .sort(
      (a, b) =>
        (b.severity === "critical" ? 1 : 0) -
          (a.severity === "critical" ? 1 : 0) || b.tick - a.tick,
    )
    .slice(0, 5)) {
    const div = document.createElement("div");
    div.className = "alert " + a.severity;
    button(
      `${a.subject}: ${a.cause}${a.count > 1 ? " ×" + a.count : ""} · t${a.tick}`,
      () => stage?.focus(a.x, a.y),
      div,
    );
    alerts.append(div);
  }
}
document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input,select,textarea") || !stage)
    return;
  if (e.code === "Space") {
    e.preventDefault();
    clock.paused = !clock.paused;
    hud();
  }
  if (/^[1-9]$/.test(e.key)) {
    if (e.ctrlKey) {
      e.preventDefault();
      groups.set(e.key, [...selection]);
    } else if (e.altKey) {
      e.preventDefault();
      bookmarks.set(e.key, { x: stage.target.x, y: stage.target.z });
    } else if (e.shiftKey) {
      const p = bookmarks.get(e.key);
      if (p) stage.focus(p.x, p.y);
    } else {
      selection = new Set(groups.get(e.key) || []);
      hud();
    }
  }
  if (e.key === "Escape") {
    placing = null;
    app.querySelector(".dialog")?.remove();
  }
  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    stage.pan(
      e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0,
      e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0,
    );
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clock.paused = true;
    playing?.pause();
    autosave();
    hud();
  } else last = performance.now();
});
window.addEventListener("pagehide", () => {
  clock.paused = true;
  autosave();
});

// SECTION HARNESS — temporary state only; no localStorage writes
const CR = {
  project(x: number, y: number) {
    return campaign?.project(x, y) || stage?.project(x, y) || null;
  },
  runFullSelfCheck() {
    const w = createWorld(syntheticPack().missions[0], "selfcheck", true),
      before = checksum(w),
      r = record(w);
    const c: Command = {
      tick: 0,
      playerId: 0,
      sequence: 0,
      type: "move",
      actorIds: [1],
      x: 83,
      y: 53,
      queued: false,
    };
    queue(w, c);
    captureCommand(r, w, c);
    for (let i = 0; i < 5; i++) step(w);
    const s = save(w, { paused: true, speed: 2, accumulator: 42 });
    return {
      pass:
        checksum(load(s, "selfcheck").world) === checksum(w) &&
        checksum(replay(seal(r, w), "selfcheck")) === checksum(w),
      initial: before,
      final: checksum(w),
      mode: pack.kind,
    };
  },
  inspect() {
    return {
      world: world ? structuredClone(world) : null,
      campaign: campaign?.inspect() ?? null,
      contentHash,
      packKind: pack.kind,
      missionCount: pack.missions.length,
      assetCount: Object.keys(pack.assets).length,
      soundCount: Object.keys(pack.sounds).length,
      paused: clock.paused,
      selection: [...selection],
      renderer: stage
        ? {
            calls: stage.renderer.info.render.calls,
            triangles: stage.renderer.info.render.triangles,
          }
        : null,
    };
  },
  renderPurity() {
    if (campaign) return campaign.renderPurity();
    if (!world || !stage) return true;
    const before = checksum(world);
    stage.render();
    return before === checksum(world);
  },
  advanceCampaign(ticks: number) {
    campaign?.advance(ticks);
  },
};
declare global {
  interface Window {
    CR: typeof CR;
  }
}
window.CR = CR;

// SECTION BOOT — pack is embedded in the final HTML; no fetch or CDN.
async function boot(): Promise<void> {
  const embedded = document.querySelector<HTMLScriptElement>("#gw-pack");
  if (embedded?.textContent?.trim()) {
    app.textContent = "Loading your private GeneWars content…";
    const bytes = Uint8Array.from(atob(embedded.textContent.trim()), (c) =>
      c.charCodeAt(0),
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    contentHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    if (contentHash !== embedded.dataset.sha256)
      throw new Error("Embedded pack hash mismatch");
    const data = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).json();
    pack = PackSchema.parse(data);
  } else pack = syntheticPack();
  menu();
}
void boot().catch((e) => {
  app.replaceChildren();
  showError(e);
});
