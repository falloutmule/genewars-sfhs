import type { Pack, Mission } from "../content/types";
import { Stage, type SceneEntity } from "../render/stage";
import { campaignBuildingAsset } from "../sim/campaign/building-startup-adapter";
import { connectInput, type PickWorld } from "../platform/input";
import { CampaignDatabase } from "../platform/campaign-storage";
import { CampaignAudio } from "../platform/campaign-audio";
import { i16, u32 } from "../sim/campaign/bytes";
import { checksum } from "../sim/checksum";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  campaignBuildingAvailable,
  actOnCampaignResult,
  continueCampaign,
  restartCampaign,
  campaignObjectiveContext,
  type CampaignWorld,
  type CampaignCommand,
} from "../sim/campaign/world";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  storeCampaignRecovery,
  type CampaignSave,
  type CampaignReplay,
  type CampaignSession,
} from "../sim/campaign/persistence";
import { animationProfile } from "../sim/mechanics/animation";
import { groundHeight } from "../sim/mechanics/terrain";
import type { ResultAction } from "../sim/mechanics/outcome";
import { describeMissionObjectives } from "../sim/mechanics/mission-objectives";
import { specialistCorpseBinding } from "../sim/mechanics/specialist-corpse";
const NAMES: Record<number, string> = {
  0: "Genepod",
  1: "Turret",
  3: "First Stage Distributor",
  4: "Recycling Plant",
  6: "Photon Processor",
  11: "Extractor",
};
// Presentation policy:60 source callbacks/second at1x. The original wall-clock
// cadence remains unresolved; simulation/replay never depends on render FPS.
const CALLBACK_MS = 1000 / 60;
export interface CampaignController {
  stop(): void;
  inspect(): unknown;
  project(x: number, y: number): { x: number; y: number } | null;
  advance(ticks: number): void;
  renderPurity(): boolean;
}
export async function openCampaign(
  app: HTMLElement,
  pack: Pack,
  contentHash: string,
  onMenu: () => void,
  restored?: CampaignSave,
): Promise<CampaignController> {
  let w = restored?.world ?? createCampaign(pack, contentHash),
    initial = structuredClone(w),
    session: CampaignSession = restored?.session ?? {
      paused: false,
      speed: 1,
      accumulator: 0,
    };
  let scene: Stage | null = null,
    input: (() => void) | null = null,
    raf = 0,
    last = performance.now(),
    alive = true,
    rendering = false,
    lastHud = -1,
    placing: number | null = null,
    geneticistMuleTarget: number | null = null,
    shepherdTarget: string | null = null,
    botanistPlantType: number | null = null,
    resultShown = "";
  let recording: CampaignReplay | null = null;
  const selected = new Set<number>(),
    abort = new AbortController();
  const database = new CampaignDatabase();
  const audio = new CampaignAudio(pack);
  let recoverySaving = false;
  const groups = new Map<string, number[]>(),
    bookmarks = new Map<string, { x: number; y: number }>();
  let minimap: HTMLCanvasElement | null = null;
  let loadCount = 0,
    loading = false;
  let renderedTick = -1;
  const renderErrors: string[] = [];
  const buildMeta = JSON.parse(
    document.querySelector("#gw-build-meta")?.textContent ?? "null",
  ) as { commit: string | null; dirty: boolean } | null;
  const node = (id: string) => app.querySelector<HTMLElement>("#" + id)!;
  const say = (message: string) => {
    const p = app.querySelector("#campaign-notice");
    if (p) p.textContent = message;
  };
  function button(
    parent: HTMLElement,
    label: string,
    action: () => void | Promise<void>,
  ) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => {
      try {
        void Promise.resolve(action()).catch((e) =>
          say(String(e instanceof Error ? e.message : e)),
        );
      } catch (e) {
        say(String(e instanceof Error ? e.message : e));
      }
    });
    parent.append(b);
    return b;
  }
  function modal(title: string) {
    app.querySelector(".dialog")?.remove();
    const cover = document.createElement("div"),
      body = document.createElement("div"),
      h = document.createElement("h2");
    cover.className = "dialog";
    body.className = "dialog-inner";
    cover.setAttribute("role", "dialog");
    cover.setAttribute("aria-modal", "true");
    h.textContent = title;
    body.append(h);
    cover.append(body);
    app.append(cover);
    return body;
  }
  function exportFile(name: string, content: string) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      );
    a.href = url;
    a.download = name;
    a.click();
    // Keep the Blob alive while file-origin browsers start a large download.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function importFile(callback: (text: string) => void) {
    const f = document.createElement("input");
    f.type = "file";
    f.accept = ".json";
    f.addEventListener("change", async () => {
      const file = f.files?.[0];
      if (file && file.size <= 16000000)
        try {
          await callback(await file.text());
        } catch (e) {
          say(String(e));
        }
    });
    f.click();
  }
  function snapshot() {
    return saveCampaign(w, session);
  }
  function recovery() {
    if (recoverySaving) return;
    recoverySaving = true;
    try {
      void database
        .storeRecovery(snapshot())
        .catch((e) => say(String(e instanceof Error ? e.message : e)))
        .finally(() => (recoverySaving = false));
    } catch (e) {
      recoverySaving = false;
      say(String(e));
    }
  }
  function currentMission(): Mission {
    return pack.missions.find((m) => m.id === w.missionId)!;
  }
  function pickWorld(): PickWorld {
    return {
      specialists: [
        ...w.actors
          .filter((a) => a.ready)
          .map((a) => ({
            id: a.id,
            x: a.motion.x / 256,
            y: a.motion.y / 256,
            hitOffset: 0,
          })),
        ...w.ecology.mules
          .filter(
            (m) =>
              m.native[6] === 1 &&
              m.native[24] === w.selectedPlayer &&
              m.native[0x5e]! < 24,
          )
          .map((m) => ({
            id: 2000 + m.index,
            x: i16(m.native as number[], 7) / 256,
            y: i16(m.native as number[], 9) / 256,
            hitOffset: 0,
          })),
      ],
      buildings: w.buildings.map((b) => ({
        id: b.id,
        x: b.x / 256,
        y: b.y / 256,
        hitOffset: 0,
      })),
    };
  }
  function issue(point: [number, number], queued: boolean) {
    const a = w.actors.find((a) => selected.has(a.id));
    const mule = w.ecology.mules.find((m) => selected.has(2000 + m.index));
    if (!a && !mule) {
      say("Select a specialist or owned Mule first.");
      return;
    }
    const command: CampaignCommand = mule
      ? { type: "move-mule", muleIndex: mule.index, point, queued }
      : placing === null
        ? { type: "move", actorId: a!.id, point, queued }
        : {
            type: "construct",
            actorId: a!.id,
            selector: placing as 0 | 1 | 3 | 6 | 11,
            point,
            queued,
          };
    const r = queueCampaign(w, command);
    if (r.ok) {
      recording?.commands.push({ tick: w.tick, type: "command", command });
      say(placing === null ? "Move order queued" : "Construction order queued");
      if (!queued) placing = null;
    } else say(r.reason ?? "Order rejected");
    hud();
  }
  async function mount() {
    renderedTick = -1;
    renderErrors.length = 0;
    audio.reset(w.audio.nextSequence, w.presentation.voiceSequence ?? 0);
    input?.();
    scene?.dispose();
    app.innerHTML =
      '<div class="game campaign-game"><header class="topbar"><strong id="campaign-title"></strong><button id="campaign-pause">Pause</button><label>Speed <select id="campaign-speed" aria-label="Campaign speed"><option value=".5">½×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><button id="campaign-saves">Save / load</button><button id="campaign-restart">Restart</button><button id="campaign-menu">Menu</button></header><main class="world" id="campaign-world"><div class="overlay-label" id="campaign-phase"></div></main><aside class="sidebar"><section><h2>Mission</h2><div id="campaign-objectives"></div></section><section><h2>Specialists</h2><div id="campaign-specialists"></div><p id="campaign-selection"></p><button id="campaign-cancel">Stop selected order</button><div id="campaign-role"></div></section><section><h2>Construct</h2><div id="campaign-build"></div></section><section><h2>Power and GOOP</h2><div id="campaign-economy"></div></section><section><h2>Alerts</h2><div id="campaign-alerts"></div></section></aside><footer class="footer"><span id="campaign-resources"></span><span id="campaign-notice" role="status"></span></footer></div>';
    node("campaign-title").textContent =
      `${w.missionId.toString().padStart(2, "0")} · ${currentMission().name}`;
    scene = new Stage(node("campaign-world"), pack);
    await scene.setMission(currentMission());
    const sidebar = app.querySelector<HTMLElement>(".sidebar")!,
      sections = [...sidebar.querySelectorAll<HTMLElement>("section")],
      tabs = document.createElement("nav");
    tabs.className = "campaign-tabs";
    tabs.setAttribute("aria-label", "Mission panels");
    for (const [i, label] of [
      "Mission",
      "Units",
      "Build",
      "Economy",
      "Alerts",
    ].entries())
      button(tabs, label, () => {
        sections.forEach((s, j) => s.classList.toggle("active", i === j));
        for (const [j, b] of [...tabs.querySelectorAll("button")].entries())
          b.setAttribute("aria-pressed", String(i === j));
      });
    sections[1].classList.add("active");
    tabs.children[1].setAttribute("aria-pressed", "true");
    sidebar.prepend(tabs);
    minimap = document.createElement("canvas");
    minimap.className = "minimap";
    minimap.width = minimap.height = 128;
    minimap.setAttribute("aria-label", "World overview; tap to focus camera");
    minimap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = minimap!.getBoundingClientRect();
      scene?.focus(
        ((e.clientX - r.left) * 128) / r.width,
        ((e.clientY - r.top) * 128) / r.height,
      );
    });
    node("campaign-world").append(minimap);
    input = connectInput(
      scene,
      () => pickWorld(),
      (ids) => {
        selected.clear();
        ids.forEach((id) => selected.add(id));
        placing = null;
        hud();
      },
      (x, y, queued) => issue([x * 256 + 127, y * 256 + 127], queued),
      () => placing !== null,
    );
    node("campaign-pause").addEventListener("click", () => {
      session.paused = !session.paused;
      hud();
    });
    (node("campaign-speed") as HTMLSelectElement).value = String(session.speed);
    node("campaign-speed").addEventListener("change", (e) => {
      session.speed = Number(
        (e.target as HTMLSelectElement).value,
      ) as CampaignSession["speed"];
    });
    node("campaign-saves").addEventListener("click", saves);
    node("campaign-restart").addEventListener("click", () => {
      w = restartCampaign(w, pack);
      selected.clear();
      placing = null;
      recording = null;
      resultShown = "";
      session.accumulator = 0;
      session.paused = false;
      void mount().then(briefing);
    });
    node("campaign-menu").addEventListener("click", () => {
      recovery();
      controller.stop();
      onMenu();
    });
    node("campaign-cancel").addEventListener("click", () => {
      const actorId = w.actors.find((a) => selected.has(a.id))?.id;
      const mule = w.ecology.mules.find((m) => selected.has(2000 + m.index));
      if (actorId === undefined && !mule) {
        say("Select a specialist or owned Mule first.");
        return;
      }
      const command: CampaignCommand = mule
        ? {
            type: "move-mule",
            muleIndex: mule.index,
            point: [
              i16(mule.native as number[], 7),
              i16(mule.native as number[], 9),
            ],
            queued: false,
          }
        : { type: "cancel", actorId: actorId! };
      const r = queueCampaign(w, command);
      if (r.ok)
        recording?.commands.push({ tick: w.tick, type: "command", command });
    });
    lastHud = -1;
    hud();
  }
  function briefing() {
    if (w.phase !== "briefing") return;
    const body = modal(`${currentMission().name} · Mission briefing`),
      p = document.createElement("p");
    p.className = "briefing-text";
    p.textContent = currentMission().briefing;
    body.append(p);
    const detail = document.createElement("p");
    detail.className = "help";
    detail.textContent =
      w.missionId === 1
        ? "Land your specialists. Select the Engineer, build an Extractor, then a First Stage Distributor and three Photon Processors. Construction includes travel, terrain work and payment. Pause lets you issue orders; shift queues them."
        : "Your specialists and campaign progress were carried from the preceding mission. Later mission systems remain under development.";
    body.append(detail);
    const badge = document.createElement("p");
    badge.className = "badge";
    badge.textContent = "Campaign development · canonical acceptance0/24";
    body.append(badge);
    button(body, "Deploy specialists", () => {
      recording?.commands.push({ tick: w.tick, type: "enter" });
      enterCampaign(w, pack);
      body.parentElement?.remove();
      recovery();
      hud();
    });
    button(body, "Back to menu", () => {
      controller.stop();
      onMenu();
    });
  }
  function saves() {
    const was = session.paused;
    session.paused = true;
    const body = modal("Campaign saves and replay");
    for (let slot = 1; slot <= 3; slot++) {
      const row = document.createElement("div");
      row.className = "row";
      body.append(row);
      button(row, `Save slot ${slot}`, async () => {
        await database.saveManual(slot, snapshot());
        say("Campaign save stored");
      });
      button(row, `Load slot ${slot}`, async () => {
        loading = true;
        try {
          const s =
            (await database.loadManual(slot)) ??
            localStorage.getItem(`gw:campaign:manual:${slot}`);
          if (!s) throw new Error("Empty campaign slot");
          await restore(s);
        } finally {
          loading = false;
        }
      });
    }
    button(body, "Export campaign save", () =>
      exportFile("genewars-campaign-save.json", snapshot()),
    );
    button(body, "Import campaign save", () => importFile(restore));
    button(body, "Export campaign replay", () => {
      if (!recording)
        throw new Error(
          "Replay recording starts after deployment or save restoration",
        );
      exportFile(
        "genewars-campaign-replay.json",
        JSON.stringify(sealCampaignReplay(recording, w)),
      );
    });
    button(body, "Resume", () => {
      body.parentElement?.remove();
      session.paused = was;
      last = performance.now();
      hud();
    });
  }
  async function restore(text: string) {
    const s = loadCampaign(text, contentHash);
    w = s.world;
    session = s.session;
    session.paused = true;
    initial = structuredClone(w);
    selected.clear();
    placing = null;
    recording = recordCampaign(
      w,
      buildMeta?.commit ?? null,
      buildMeta?.dirty ?? null,
    );
    resultShown = "";
    await mount();
    briefing();
    loadCount++;
  }
  function resultAction(action: ResultAction) {
    recording?.commands.push({ tick: w.tick, type: "result", action });
    actOnCampaignResult(w, action);
    recovery();
  }
  function result() {
    if (w.phase !== "result" || resultShown === w.result.phase) return;
    resultShown = w.result.phase;
    if (w.result.phase === "victory-notification") {
      const body = modal("Mission conditions verified"),
        p = document.createElement("p");
      p.textContent = pack.texts[555] ?? "Mission complete";
      body.append(p);
      button(body, "View result", () => {
        resultAction({ type: "continue-notification" });
        resultAction({
          type: "enter-victory",
          videoLockDepth: 0,
          presentationResolved: true,
        });
        resultShown = "";
        result();
      });
    } else if (w.result.phase === "victory-view") {
      const body = modal(`${currentMission().name} · Victory`),
        p = document.createElement("p");
      p.textContent =
        pack.texts[477 + w.players[w.selectedPlayer].progress] ??
        "Campaign victory";
      body.append(p);
      const stats = document.createElement("p");
      stats.textContent = `Campaign progress: ${w.players[w.selectedPlayer].progress}/24.`;
      body.append(stats);
      for (const [i, at] of [
        0x6f9, 0x6fd, 0x701, 0x705, 0x709, 0xd,
      ].entries()) {
        const row = document.createElement("p");
        row.textContent = `${pack.texts[546 + i] ?? `Statistic ${i + 1}`}: ${u32(w.players[w.selectedPlayer].raw, at) | 0}`;
        body.append(row);
      }
      button(body, "Continue to next mission", () => {
        resultAction({ type: "advance-victory", runtimeInputFlags: 1 });
        recording?.commands.push({ tick: w.tick, type: "continue" });
        w = continueCampaign(w, pack);
        initial = structuredClone(w);
        selected.clear();
        placing = null;
        resultShown = "";
        void mount().then(briefing);
      });
    } else if (w.result.phase === "lost") {
      const body = modal("Mission failed"),
        p = document.createElement("p");
      p.textContent =
        "No surviving construction capability remains. Restart the mission or load a save.";
      body.append(p);
      button(body, "Restart mission", () => {
        w = restartCampaign(w, pack);
        session.paused = false;
        resultShown = "";
        void mount().then(briefing);
      });
    }
  }
  function hud() {
    if (!alive || !app.querySelector("#campaign-resources")) return;
    const p = w.players[w.selectedPlayer];
    node("campaign-resources").textContent =
      `Funds ${p.funds} · GOOP ${p.goop}/${w.economy.players[p.id].capacity} · callback ${w.frame}`;
    node("campaign-pause").textContent = session.paused ? "Resume" : "Pause";
    node("campaign-pause").setAttribute("aria-pressed", String(session.paused));
    node("campaign-phase").textContent =
      placing !== null
        ? `Place ${NAMES[placing]} · tap terrain${session.paused ? " · paused" : ""}`
        : w.phase === "blocked"
          ? "A required runtime callback needs implementation; see alerts"
          : w.landings.some((l) => l.phase < 1)
            ? "Landing specialists…"
            : session.paused
              ? "Paused · orders accepted"
              : "Campaign development ·0/24 accepted";
    const ledger = node("campaign-objectives");
    ledger.replaceChildren();
    const objectives = describeMissionObjectives(
      w.players.map((p) => p.raw),
      campaignObjectiveContext(w),
      w.missionPrefix,
    );
    if (!objectives.ok) throw new Error(objectives.reason);
    for (const goal of objectives.value.goals) {
      const row = document.createElement("p");
      row.className = "objective" + (goal.thresholdReached ? " complete" : "");
      row.textContent = `${goal.label}: ${goal.current}/${goal.target}${goal.timerRemaining === undefined ? "" : ` · timer ${goal.timerRemaining}`}`;
      ledger.append(row);
    }
    for (const zone of objectives.value.zones ?? []) {
      const row = document.createElement("p");
      row.textContent = `Zone ${zone.index + 1}: ${zone.remainingQuota}/${zone.initialQuota} remaining · (${(zone.center[0] / 256).toFixed(1)}, ${(zone.center[1] / 256).toFixed(1)})${zone.remainingQuota > 0 ? (zone.activeObservers > 0 ? " · Ethereal inspection active" : " · Awaiting Ethereal inspection") : ""}`;
      ledger.append(row);
      button(ledger, `Show zone ${zone.index + 1}`, () => {
        scene?.focus(zone.center[0] / 256, zone.center[1] / 256);
      });
    }
    const specialists = node("campaign-specialists");
    specialists.replaceChildren();
    for (const a of w.actors.filter(
      (a) =>
        a.owner === w.selectedPlayer && w.specialists.records[a.id][6] === 3,
    )) {
      const bp = p.blueprints[a.blueprintIndex],
        b = button(
          specialists,
          `${bp.name} · ${["Engineer", "Botanist", "Geneticist", "Shepherd"][bp.category]} · skill ${bp.skill}`,
          () => {
            selected.clear();
            selected.add(a.id);
            placing = null;
            scene?.focus(a.motion.x / 256, a.motion.y / 256);
            hud();
          },
        );
      b.disabled = !a.ready;
      b.setAttribute("aria-pressed", String(selected.has(a.id)));
    }
    for (const mule of w.ecology.mules.filter(
      (m) =>
        m.native[6] === 1 &&
        m.native[24] === w.selectedPlayer &&
        m.native[0x5e]! < 24,
    )) {
      const b = button(
        specialists,
        `Mule ${mule.index + 1} · health ${i16(mule.native as number[], 0x6a)}/${i16(mule.native as number[], 0x64)}`,
        () => {
          selected.clear();
          selected.add(2000 + mule.index);
          placing = null;
          scene?.focus(
            i16(mule.native as number[], 7) / 256,
            i16(mule.native as number[], 9) / 256,
          );
          hud();
        },
      );
      b.setAttribute("aria-pressed", String(selected.has(2000 + mule.index)));
    }
    const a = w.actors.find(
      (a) => selected.has(a.id) && w.specialists.records[a.id][6] === 3,
    );
    node("campaign-selection").textContent = a
      ? a.reason
      : "Tap a specialist, then a destination. Drag to pan; pinch or scroll to zoom.";
    const role = node("campaign-role");
    if (
      !(
        document.activeElement instanceof HTMLSelectElement &&
        role.contains(document.activeElement)
      )
    ) {
      role.replaceChildren();
      if (a && p.blueprints[a.blueprintIndex].category === 3) {
        const help = document.createElement("p");
        help.textContent = "Control your creatures within this Shepherd's range. Stop or move to end control.";
        role.append(help);
        for (const [mode, label] of [[0, "Control nearby herd"], [1, "Support herd combat"], [2, "Encourage nearby mating"]] as const) {
          const control = button(role, label, () => {
            const current = w.actors.find(p => p.id === a.id)!,
              command: CampaignCommand = { type: "shepherd-control", actorId: a.id,
                point: [current.motion.x & 32767, current.motion.y & 32767], mode },
              result = queueCampaign(w, command);
            if (result.ok) {
              recording?.commands.push({ tick: w.tick, type: "command", command });
              say("Shepherd control queued");
            } else say(result.reason ?? "Shepherd order rejected");
          });
          control.disabled = !a.ready || w.phase !== "active";
        }
        const label = document.createElement("label"), target = document.createElement("select");
        label.textContent = "Shepherd target "; target.setAttribute("aria-label", "Shepherd target");
        const choices = [
          ...w.ecology.mules.filter(m => m.native[6] === 1).map(m => ({ kind: 1 as const, index: m.index, label: `Creature ${m.index + 1}` })),
          ...w.actors.filter(actor => actor.ready && w.specialists.records[actor.id][6] === 3 && actor.id !== a.id).map(actor => ({ kind: 3 as const, index: actor.id, label: w.players[actor.owner].blueprints[actor.blueprintIndex].name })),
          ...w.buildings.filter(b => w.buildingNative[b.slot][6] === 4).map(b => ({ kind: 4 as const, index: b.slot, label: `${NAMES[b.selector] ?? "Building"} ${b.slot + 1}` })),
        ];
        for (const choice of choices) {
          const option = document.createElement("option"); option.value = `${choice.kind}:${choice.index}`; option.textContent = choice.label; target.append(option);
        }
        if (shepherdTarget !== null && [...target.options].some(option => option.value === shepherdTarget)) target.value = shepherdTarget;
        else shepherdTarget = target.value || null;
        target.addEventListener("change", () => { shepherdTarget = target.value; });
        label.append(target); role.append(label);
        for (const [task, label] of [[1, "Attack target"], [2, "Stun creatures near target"]] as const) {
          const control = button(role, label, () => {
            const choice = choices.find(choice => `${choice.kind}:${choice.index}` === target.value);
            if (!choice) return;
            const command: CampaignCommand = { type: "shepherd-interact", actorId: a.id, task, target: { kind: choice.kind, index: choice.index } }, result = queueCampaign(w, command);
            if (result.ok) { recording?.commands.push({ tick: w.tick, type: "command", command }); say("Shepherd target order queued"); }
            else say(result.reason ?? "Shepherd order rejected");
          });
          control.disabled = !a.ready || w.phase !== "active" || choices.length === 0;
        }
      }
      if (a && p.blueprints[a.blueprintIndex].category === 1) {
        const resource = document.createElement("p");
        resource.textContent = `Plant samples: ${w.specialists.records[a.id][114]}/40`;
        role.append(resource);
        const label = document.createElement("label");
        label.textContent = "Plant type ";
        const target = document.createElement("select");
        target.setAttribute("aria-label", "Plant type");
        for (let selector = 0; selector < 12; selector++)
          if (u32(p.raw, 0x67e + selector * 4) > 0) {
            const option = document.createElement("option");
            option.value = String(selector);
            option.textContent = `Plant type ${selector + 1}`;
            target.append(option);
          }
        if (
          botanistPlantType !== null &&
          [...target.options].some((o) => Number(o.value) === botanistPlantType)
        )
          target.value = String(botanistPlantType);
        else
          botanistPlantType = target.options.length
            ? Number(target.value)
            : null;
        target.addEventListener("change", () => {
          botanistPlantType = Number(target.value);
        });
        label.append(target);
        role.append(label);
        for (const [task, label] of [
          [0, "Collect plant samples nearby"],
          [1, "Plant selected type nearby"],
          [2, "Clear nearby plants"],
        ] as const) {
          const control = button(role, label, () => {
            const current = w.actors.find((p) => p.id === a.id)!,
              command: CampaignCommand = {
                type: "botanist-work",
                actorId: a.id,
                task,
                point: [current.motion.x & 32767, current.motion.y & 32767],
                ...(task === 1 ? { selector: Number(target.value) } : {}),
              },
              result = queueCampaign(w, command);
            if (result.ok) {
              recording?.commands.push({
                tick: w.tick,
                type: "command",
                command,
              });
              say("Botanist order queued");
            } else say(result.reason ?? "Botanist order rejected");
          });
          control.disabled =
            !a.ready ||
            w.phase !== "active" ||
            (task === 1 && target.options.length === 0);
        }
      }
      if (a && p.blueprints[a.blueprintIndex].category === 2) {
        const quality = document.createElement("p");
        quality.textContent = `Mule research quality: ${Math.min(100, u32(p.raw, 0x62a) >>> 11)}%`;
        role.append(quality);
        const label = document.createElement("label");
        label.textContent = "Mule target ";
        const target = document.createElement("select");
        target.id = "campaign-mule-target";
        target.setAttribute("aria-label", "Mule target");
        for (const m of w.ecology.mules.filter((m) => m.native[6] === 1)) {
          const option = document.createElement("option");
          option.value = String(m.index);
          option.textContent = `Mule ${m.index + 1} · ${m.native[24] === 4 ? "neutral" : "owner " + (m.native[24]! + 1)} · health ${i16(m.native as number[], 106)}/${i16(m.native as number[], 100)}${m.native[94]! >= 24 ? " · remains" : ""}`;
          target.append(option);
        }
        if (
          geneticistMuleTarget !== null &&
          [...target.options].some(
            (o) => Number(o.value) === geneticistMuleTarget,
          )
        )
          target.value = String(geneticistMuleTarget);
        else
          geneticistMuleTarget = target.options.length
            ? Number(target.value)
            : null;
        target.addEventListener("change", () => {
          geneticistMuleTarget = Number(target.value);
        });
        label.append(target);
        role.append(label);
        for (const [type, label] of [
          ["research-mule", "Capture / research"],
          ["heal-mule", "Heal Mule"],
        ] as const) {
          const control = button(role, label, () => {
            const command: CampaignCommand = {
                type,
                actorId: a.id,
                muleIndex: Number(target.value),
              },
              result = queueCampaign(w, command);
            if (result.ok) {
              recording?.commands.push({
                tick: w.tick,
                type: "command",
                command,
              });
              say(
                type === "heal-mule"
                  ? "Mule healing order queued"
                  : "Mule research order queued",
              );
            } else say(result.reason ?? "Geneticist order rejected");
          });
          control.disabled =
            !a.ready || target.options.length === 0 || w.phase !== "active";
        }
      }
    }
    const build = node("campaign-build");
    build.replaceChildren();
    for (const selector of [11, 3, 6, 0, 1]) {
      const skill = a ? p.blueprints[a.blueprintIndex].skill : 0,
        cost = pack.rules!.tables.constructionCosts[selector] - 2 * skill,
        b = button(build, `${NAMES[selector]} · ${cost}`, () => {
          placing = selector;
          hud();
        });
      b.disabled =
        !a ||
        p.blueprints[a.blueprintIndex].category !== 0 ||
        !campaignBuildingAvailable(w, pack, selector);
      b.setAttribute("aria-pressed", String(placing === selector));
      b.title = b.disabled
        ? "Requires a selected Engineer, campaign progress and completed prerequisites"
        : "Pay when the Engineer reaches the prepared site";
    }
    const economy = node("campaign-economy");
    economy.replaceChildren();
    for (const b of w.economy.buildings) {
      const row = document.createElement("p");
      row.className = "help";
      row.textContent = `${NAMES[b.selector]} · ${!b.complete ? "under construction" : b.disabled ? (b.depleted ? "resource exhausted" : "disabled") : b.powered ? "powered" : "unpowered"} · energy ${b.energy}`;
      economy.append(row);
      if (b.selector === 0 && b.complete && b.owner === w.selectedPlayer) {
        const n = w.buildingNative[b.owner * 64 + b.slot],
          remaining = u32(n as number[], 54) | 0;
        const status = document.createElement("p");
        status.textContent =
          remaining > 0
            ? `Mule work remaining: ${remaining}/${i16(n as number[], 52)}`
            : `Mule research quality: ${Math.min(100, u32(p.raw, 0x62a) >>> 11)}%`;
        economy.append(status);
        const produce = button(
          economy,
          remaining > 0 ? "Cancel Mule production" : "Produce Mule · 75 total",
          () => {
            const command: CampaignCommand = {
                type: "produce-mule",
                buildingId: b.id,
              },
              result = queueCampaign(w, command);
            if (!result.ok) {
              say(result.reason ?? "Production order rejected");
              return;
            }
            recording?.commands.push({
              tick: w.tick,
              type: "command",
              command,
            });
            say("Mule production order queued");
          },
        );
        produce.disabled = w.phase !== "active";
      }
    }
    const alerts = node("campaign-alerts");
    alerts.replaceChildren();
    for (const n of [...w.notices].slice(-4).reverse()) {
      const row = document.createElement("div");
      row.className = "alert" + (n.severity === "error" ? " critical" : "");
      row.textContent = n.text;
      if (n.entityId !== null)
        button(row, "Focus", () => {
          const a = w.actors.find((a) => a.id === n.entityId),
            b = w.buildings.find((b) => b.id === n.entityId);
          if (a) scene?.focus(a.motion.x / 256, a.motion.y / 256);
          if (b) scene?.focus(b.x / 256, b.y / 256);
        });
      alerts.append(row);
    }
    result();
    if (minimap) {
      const ctx = minimap.getContext("2d")!;
      const image = ctx.createImageData(128, 128);
      for (let cell = 0; cell < 16384; cell++) {
        const material = w.terrain.bytes[cell * 14 + 5] & 7,
          color =
            material < 2
              ? [31, 82, 107]
              : material === 4
                ? [123, 100, 62]
                : [67, 105, 56];
        image.data.set([...color, 255], cell * 4);
      }
      ctx.putImageData(image, 0, 0);
      ctx.fillStyle = "#d9f9a3";
      for (const a of w.actors.filter((a) => a.ready))
        ctx.fillRect(a.motion.x / 256 - 1, a.motion.y / 256 - 1, 2, 2);
      ctx.fillStyle = "#f1c480";
      for (const b of w.buildings)
        ctx.fillRect(b.x / 256 - 1, b.y / 256 - 1, 2, 2);
    }
  }
  function drawEntities(): SceneEntity[] {
    const entities: SceneEntity[] = [];
    for (const a of w.actors.filter((a) => a.ready)) {
      const asset = pack.assets[a.art],
        profile = animationProfile(asset, a.animation.action);
      entities.push({
        id: a.sourceId,
        x: a.motion.x / 256,
        y: a.motion.y / 256,
        height: a.motion.height / 512,
        art: a.art,
        frame:
          profile.first + Math.min(a.animation.frame, profile.holds.length - 1),
        selected: selected.has(a.id),
      });
    }
    for (const b of w.buildings) {
      const art = campaignBuildingAsset(pack, b.selector),
        asset = pack.assets[art];
      if (!asset) continue;
      const native = w.buildingNative[b.slot],
        profile = animationProfile(asset, native[25]!),
        frame = native[27]!;
      entities.push({
        id: `source:3:${b.slot}`,
        x: b.x / 256,
        y: b.y / 256,
        art,
        frame: profile.first + Math.min(frame, profile.holds.length - 1),
        selected: selected.has(b.id),
      });
    }
    for (const p of w.ecology.plants.filter((p) => p.active)) {
      const art = pack.ecologyRules!.plantResources[p.selector].assetKey,
        asset = pack.assets[art];
      if (!asset) continue;
      const profile = animationProfile(asset, p.animation);
      entities.push({
        id: p.id,
        x: p.position[0] / 256,
        y: p.position[1] / 256,
        height: p.height / 512,
        art,
        frame: profile.first + Math.min(p.frame, profile.holds.length - 1),
      });
    }
    for (const mule of w.ecology.mules) {
      const n = mule.native;
      if (n[6] === 0 || !pack.assets.MULE) continue;
      const state = n[0x5e] ?? 0,
        art = state >= 26 ? "BONES" : "MULE",
        action = n[25] ?? 0,
        profile = animationProfile(pack.assets[art], action);
      const packedContext = {
        state,
        current6A: i16(n as number[], 0x6a),
        max64: i16(n as number[], 0x64),
        rawShade: n[23]!,
        virtualHeight:
          ((u32(n as number[], 0x27) | 0) - (u32(n as number[], 0x11) | 0)) | 0,
        flags15: n[21]!,
        globalShadowMode: 0,
        clipFlagBit0: false,
      };
      entities.push({
        id: mule.id,
        x: ((n[7] ?? 0) | ((n[8] ?? 0) << 8)) / 256,
        y: ((n[9] ?? 0) | ((n[10] ?? 0) << 8)) / 256,
        art,
        height: (u32(n as number[], 0x27) | 0) / 512,
        ...(n[24] === 4
          ? { neutralPacked4: packedContext }
          : {
              ownedPacked4: {
                ...packedContext,
                owner: n[24] as 0 | 1 | 2 | 3,
                sourceFrame: w.frame,
                entityId: mule.index,
                timer6C: i16(n as number[], 0x6c),
                renderCounter7B: n[0x7b]!,
              },
            }),
        selected: selected.has(2000 + mule.index),
        frame: profile.first + Math.min(n[27] ?? 0, profile.holds.length - 1),
      });
    }
    for (const l of w.landings) {
      if (l.phase !== 4) {
        const profile = animationProfile(pack.assets.EFF, 49);
        entities.push({
          id: `source:4:${l.slot}`,
          x: l.point[0] / 256,
          y: l.point[1] / 256,
          height: l.height / 512,
          art: "EFF",
          frame: profile.first,
        });
      }
      for (const p of l.particles) {
        const profile = animationProfile(pack.assets.EFF, p.code);
        entities.push({
          id: `source:4:${p.slot}`,
          x: p.x / 256,
          y: p.y / 256,
          height: p.height / 512,
          art: "EFF",
          frame: profile.first + p.animation.frame,
        });
      }
    }
    for (const [slot, e] of w.powerEffects.slots.entries())
      if (e.packet) {
        const p = e.packet,
          profile = animationProfile(pack.assets.EFF, 33);
        entities.push({
          id: `source:4:${slot}`,
          x: p.x / 256,
          y: p.y / 256,
          height: p.height / 512,
          art: "EFF",
          frame: profile.first + p.frame,
        });
      }
    for (const e of w.waterEffects.filter((e) => e.active)) {
      const profile = animationProfile(
        pack.assets.EFF,
        e.code === 0x30 ? 48 : e.code,
      );
      entities.push({
        id: `source:4:${e.slot}`,
        x: e.x / 256,
        y: e.y / 256,
        height: e.height / 512,
        art: "EFF",
        frame: profile.first + e.animation.frame,
      });
    }
    for (const e of w.ethereals.records) {
      const n = e.native;
      if (n[6] === 0) continue;
      const action = (e.binding === "offset80" ? 8 : 0) + n[25]!,
        profile = animationProfile(pack.assets.ETHEREAL, action);
      entities.push({
        id: `source:7:${e.slot}`,
        x: i16(n as number[], 7) / 256,
        y: i16(n as number[], 9) / 256,
        height: (u32(n as number[], 39) | 0) / 512,
        art: "ETHEREAL",
        frame: profile.first + Math.min(n[27]!, profile.holds.length - 1),
      });
    }
    const drawn = new Set(entities.map((e) => e.id));
    for (const [slot, e] of w.powerEffects.slots.entries()) {
      const n = e.nativePrior,
        id = `source:4:${slot}`;
      if (!e.occupied || !n || drawn.has(id)) continue;
      const corpse =
          n[69] === 69 ? specialistCorpseBinding(n, pack.rules!.tables) : null,
        art = corpse?.assetKey ?? "EFF",
        profile = animationProfile(pack.assets[art], corpse ? 9 : n[69]!);
      entities.push({
        id,
        x: i16(n as number[], 7) / 256,
        y: i16(n as number[], 9) / 256,
        height: (u32(n as number[], 39) | 0) / 512,
        art,
        frame: profile.first + Math.min(n[27]!, profile.holds.length - 1),
      });
    }
    return entities;
  }
  function tick() {
    stepCampaign(w, pack);
    if (recording && w.tick % 300 === 0)
      recording.hashes.push([w.tick, checksum(w)]);
    if (w.tick > 0 && w.tick % 900 === 0) recovery();
  }
  function frame(now: number) {
    if (!alive) return;
    const elapsed = Math.min(1000, Math.max(0, now - last));
    last = now;
    if (!session.paused && w.phase === "active") {
      session.accumulator += elapsed * session.speed;
      let count = 0;
      while (
        session.accumulator >= CALLBACK_MS &&
        count++ < 120 &&
        w.phase === "active"
      ) {
        tick();
        session.accumulator -= CALLBACK_MS;
      }
    }
    if (scene && !rendering) {
      rendering = true;
      const drawingTick = w.tick;
      scene.updateTerrain(w.terrain);
      void scene
        .syncScene(drawEntities())
        .then(() => {
          renderedTick = drawingTick;
        })
        .catch((e) => {
          if (renderErrors.at(-1) !== String(e)) renderErrors.push(String(e));
          say(String(e));
        })
        .finally(() => {
          rendering = false;
        });
    }
    scene?.render();
    if (session.paused || w.phase !== "active") audio.pause();
    else {
      audio.resume();
      audio.consume(w.audio.requests);
      audio.consumeVoices(
        w.presentation.pending.flatMap(({ event }) =>
          event.type === "specialist-voice"
            ? [{ sequence: event.sequence, request: event.request }]
            : [],
        ),
        { selectedPlayer: w.selectedPlayer, runtimeFlags: w.flags },
      );
    }
    if (w.tick !== lastHud) {
      lastHud = w.tick;
      if (w.tick % 10 === 0 || w.phase !== "active") hud();
    }
    raf = requestAnimationFrame(frame);
  }
  const controller: CampaignController = {
    stop() {
      alive = false;
      cancelAnimationFrame(raf);
      abort.abort();
      input?.();
      scene?.dispose();
      audio.dispose();
    },
    inspect() {
      return {
        loadCount,
        loading,
        renderedTick,
        renderErrors: [...renderErrors],
        world: structuredClone(w),
        selection: [...selected],
        paused: session.paused,
        renderer: scene
          ? {
              calls: scene.renderer.info.render.calls,
              triangles: scene.renderer.info.render.triangles,
            }
          : null,
      };
    },
    project(x, y) {
      return scene?.project(x, y) ?? null;
    },
    advance(ticks) {
      if (loading) throw new Error("Campaign load is still in progress");
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 20000)
        throw new Error("Invalid harness tick count");
      for (let i = 0; i < ticks && w.phase === "active"; i++) tick();
      hud();
    },
    renderPurity() {
      const before = checksum(w);
      scene?.render();
      return before === checksum(w);
    },
  };
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        session.paused = true;
        recovery();
        hud();
      }
      last = performance.now();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "pagehide",
    () => {
      session.paused = true;
      recovery();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        session.paused = !session.paused;
        hud();
      }
      if (e.code === "Escape") {
        placing = null;
        hud();
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (e.altKey) {
          if (e.ctrlKey && scene)
            bookmarks.set(e.key, { x: scene.target.x, y: scene.target.z });
          else {
            const b = bookmarks.get(e.key);
            if (b) scene?.focus(b.x, b.y);
          }
        } else if (e.ctrlKey) groups.set(e.key, [...selected]);
        else {
          selected.clear();
          for (const id of groups.get(e.key) ?? []) selected.add(id);
          hud();
        }
      }
    },
    { signal: abort.signal },
  );
  await mount();
  briefing();
  recording = recordCampaign(
    w,
    buildMeta?.commit ?? null,
    buildMeta?.dirty ?? null,
  );
  raf = requestAnimationFrame(frame);
  return controller;
}
