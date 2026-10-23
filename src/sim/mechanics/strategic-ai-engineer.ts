/**37C50/37D60/37F30/390D0 source Engineer construction planning. Numeric
 * selection is concrete; site/terrain queries and real commands are ports. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPoint,
  aiPutDword,
  aiSByte,
  aiSWord,
  aiWord,
  strategicBlueprint,
  validateStrategicAIState,
} from "./strategic-ai-state";
import {
  cloneStrategicSpecialistPlanner,
  issueStrategicRoleCommand,
  specialistLocalIndex,
  strategicRolePacket,
  validateStrategicPlannerMetadata,
  type StrategicRoleCommandContext,
  type StrategicSpecialistPlannerState,
} from "./strategic-ai-specialists-state";
import type { StrategicEngineerPlanRequest } from "./strategic-ai-specialists";
export interface StrategicEngineerRules {
  upkeep: readonly number[];
  buildingHealth: readonly number[];
  constructionCosts: readonly number[];
  buildingFootprints: readonly number[];
  buildingProgressThresholds: readonly number[];
  buildingPrerequisites: readonly number[];
  buildingValues: readonly (readonly number[])[];
  priorities: readonly (readonly number[])[];
}
export interface StrategicEngineerLocal {
  player: number;
  owner: number;
  capacity: number;
  expansion: boolean;
}
export interface StrategicEngineerSiteRequest {
  routine: 0x3a1e0;
  source: number;
  specialist: number;
  selector: number;
  classification: number;
  planning: StrategicEngineerLocal;
}
export interface StrategicEngineerSiteResult {
  routine: 0x3a1e0;
  selector: number;
  point: [number, number] | null;
}
export interface StrategicEngineerContext extends StrategicRoleCommandContext {
  rules: StrategicEngineerRules;
  planSite?(
    s: StrategicSpecialistPlannerState,
    request: StrategicEngineerSiteRequest,
  ): StrategicEngineerSiteResult;
  siteBlocked?(
    s: StrategicSpecialistPlannerState,
    request: {
      routine: 0x74e80;
      source: number;
      point: [number, number];
      footprint: number;
    },
  ): { routine: 0x74e80; blocked: boolean };
  resourceScore?(
    s: StrategicSpecialistPlannerState,
    request: {
      routine: 0x8d930;
      source: number;
      point: [number, number];
      radius: 0x400;
      extentSquared: 0x100000;
      mode: 1;
      predicate: 0x31b30;
    },
  ): { routine: 0x8d930; score: number };
  terrainHeight?(
    s: StrategicSpecialistPlannerState,
    point: [number, number],
  ): number;
  expansionSite?(
    s: StrategicSpecialistPlannerState,
    request: {
      routine: 0x320e0;
      source: 0x3a0e7;
      owner: number;
      point: [number, number];
      interval: number;
      radius: number;
      extentSquared: number;
      predicate: 0x32230;
    },
  ): { routine: 0x320e0; point: [number, number] | null };
}
export interface StrategicEngineerReceipt extends StrategicEngineerPlanRequest {
  result: boolean;
  capacity: number;
  expansion: boolean;
}
function selectorGrade(
  s: StrategicSpecialistPlannerState,
  index: number,
): [number, number] {
  const n = s.buildings[index],
    selector = aiSByte(n, 45),
    grade = aiByte(n, 46);
  if (!aiInteger(selector, 0, 13) || !aiInteger(grade, 0, 2))
    throw Error("Actual strategic building selector/grade required");
  return [selector, grade];
}
function numberRow(
  row: readonly number[],
  size: number,
  lo: number,
  hi: number,
  label: string,
): void {
  if (
    !Array.isArray(row) ||
    row.length !== size ||
    row.some((n) => !aiInteger(n, lo, hi))
  )
    throw Error(`Actual strategic Engineer ${label} required`);
}
export function validateStrategicEngineerRules(
  r: StrategicEngineerRules,
): void {
  for (const name of [
    "upkeep",
    "buildingFootprints",
    "buildingPrerequisites",
  ] as const)
    numberRow(r[name], 14, 0, 255, name);
  numberRow(r.buildingHealth, 42, -32768, 32767, "buildingHealth");
  numberRow(
    r.constructionCosts,
    14,
    -0x80000000,
    0x7fffffff,
    "constructionCosts",
  );
  numberRow(
    r.buildingProgressThresholds,
    42,
    0,
    255,
    "buildingProgressThresholds",
  );
  for (const name of ["buildingValues", "priorities"] as const) {
    if (r[name].length !== 14)
      throw Error(`Actual strategic Engineer ${name} required`);
    for (const row of r[name])
      numberRow(
        row,
        3,
        name === "priorities" ? 0 : -32768,
        name === "priorities" ? 255 : 32767,
        name,
      );
  }
}
/**43960 exact progress/prerequisite/override admission. */
export function strategicEngineerBuildingAvailable(
  s: StrategicSpecialistPlannerState,
  owner: number,
  selector: number,
  r: StrategicEngineerRules,
): boolean {
  if (!aiInteger(selector, 0, 13))
    throw Error("Actual strategic available selector required");
  const p = s.players[owner],
    sourceOwner = p[0x4a1];
  if (!aiInteger(sourceOwner, 0, 3))
    throw Error("Actual strategic construction-owner context required");
  const progress = aiSByte(s.players[sourceOwner], 0x6e7),
    threshold = r.buildingProgressThresholds[selector * 3];
  if (progress < threshold || threshold >= 30) return false;
  const prerequisite = r.buildingPrerequisites[selector];
  return (
    prerequisite === 255 ||
    aiByte(p, 0x600 + prerequisite) > 0 ||
    !!(aiWord(p, 0x60e) & (1 << selector))
  );
}
/**439E0 exact next-grade admission, distinct from43960. */
export function strategicEngineerUpgradeAvailable(
  s: StrategicSpecialistPlannerState,
  owner: number,
  selector: number,
  grade: number,
  r: StrategicEngineerRules,
): boolean {
  const sourceOwner = s.players[owner][0x4a1];
  if (!aiInteger(sourceOwner, 0, 3))
    throw Error("Actual strategic construction-owner context required");
  return (
    grade <= 2 &&
    ![10, 11, 13].includes(selector) &&
    !!s.players[owner][0x602] &&
    aiSByte(s.players[sourceOwner], 0x6e7) >=
      r.buildingProgressThresholds[selector * 3 + grade]
  );
}
function active(s: StrategicSpecialistPlannerState, owner: number): number[] {
  const out: number[] = [];
  for (let i = owner * 64; i < owner * 64 + 64; i++)
    if (aiByte(s.buildings[i], 6)) out.push(i);
  return out;
}
function matching(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  kind?: number,
): number[] {
  const filter = s.records[l.player][0x6bd];
  return active(s, s.records[l.player][4]).filter(
    (i) =>
      (!filter || s.records[l.player][0x55 + (i % 64)] === filter) &&
      (kind === undefined || aiSByte(s.buildings[i], 45) === kind),
  );
}
function funds(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
): number {
  return (
    (aiDword(s.players[l.owner], 0x4a3) + aiDword(s.players[l.owner], 0x4a7)) |
    0
  );
}
function cost(
  s: StrategicSpecialistPlannerState,
  actor: number,
  selector: number,
  c: StrategicEngineerContext,
): number {
  return (
    (c.rules.constructionCosts[selector] -
      aiSByte(strategicBlueprint(s, actor), 23) * 2) |
    0
  );
}
function site(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  selector: number,
  source: number,
  c: StrategicEngineerContext,
): StrategicEngineerSiteResult {
  if (!c.planSite)
    throw Error("Strategic Engineer3A1E0 site planning is not implemented");
  const held = s.records[l.player],
    result = c.planSite(s, {
      routine: 0x3a1e0,
      source,
      specialist: actor,
      selector,
      classification: held[0x6bd],
      planning: l,
    });
  if (
    result?.routine !== 0x3a1e0 ||
    !aiInteger(result.selector, 0, 14) ||
    (result.selector !== 14 &&
      (!result.point ||
        result.point.length !== 2 ||
        result.point.some((v) => !aiInteger(v, -32768, 32767)))) ||
    s.records[l.player] !== held
  )
    throw Error("Actual strategic3A1E0 site result required");
  return result;
}
interface BuildSites {
  plan: number;
  survey: number;
  blocked: number;
  command: number;
}
function plannedBuild(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  desired: number,
  sites: BuildSites,
  c: StrategicEngineerContext,
): boolean {
  const ai = s.records[l.player];
  ai[0x60f] = 10;
  const plan = site(s, l, actor, desired, sites.plan, c);
  let kind = plan.selector;
  if (kind === 11 && active(s, ai[4]).length > 0) {
    if (!c.resourceScore)
      throw Error("Strategic Engineer8D930 resource survey is not implemented");
    const result = c.resourceScore(s, {
      routine: 0x8d930,
      source: sites.survey,
      point: plan.point!,
      radius: 0x400,
      extentSquared: 0x100000,
      mode: 1,
      predicate: 0x31b30,
    });
    if (result?.routine !== 0x8d930 || !aiInteger(result.score, 0, 0xffffffff))
      throw Error("Actual strategic resource score required");
    if (result.score < 200) {
      kind = 14;
      aiPutDword(ai, 0x3a, 5000);
    }
  }
  if (kind === 14 || cost(s, actor, kind, c) > funds(s, l)) return false;
  if (!c.siteBlocked)
    throw Error("Strategic Engineer74E80 site query is not implemented");
  const result = c.siteBlocked(s, {
    routine: 0x74e80,
    source: sites.blocked,
    point: plan.point!,
    footprint: c.rules.buildingFootprints[kind],
  });
  if (result?.routine !== 0x74e80 || typeof result.blocked !== "boolean")
    throw Error("Actual strategic74E80 site result required");
  if (!result.blocked) {
    ai[0x47 + kind] = ai[0x6bd];
    issueStrategicRoleCommand(
      s,
      c,
      {
        routine: 0x811a0,
        source: sites.command,
        player: aiByte(s.specialists[actor].native, 24),
        specialist: actor,
        packet: strategicRolePacket(
          s,
          c,
          sites.command,
          {
            0: actor,
            2: 10,
            4: kind << 8,
            6: plan.point![0],
            8: plan.point![1],
          },
          16,
        ),
      },
      true,
    );
  }
  //Source reports planning handled even when the real occupancy query blocks.
  return true;
}
function repairCommand(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  index: number,
  source: number,
  c: StrategicEngineerContext,
): void {
  const n = s.buildings[index];
  issueStrategicRoleCommand(s, c, {
    routine: 0x811a0,
    source,
    player: s.records[l.owner][4],
    specialist: actor,
    packet: strategicRolePacket(
      s,
      c,
      source,
      {
        0: actor,
        2: 10,
        4: (aiWord(n, 15) & 255) | 0xe00,
        6: aiSWord(n, 7),
        8: aiSWord(n, 9),
      },
      16,
    ),
  });
}
/**37D60 reserves the first unattended incomplete row even at full health. */
export function planStrategicEngineerRepair(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  c: StrategicEngineerContext,
): boolean {
  if (aiSByte(s.specialists[actor].native, 85) !== 1) return false;
  for (let index = l.owner * 64; index < l.owner * 64 + 64; index++) {
    const b = s.buildings[index];
    if (!aiByte(b, 6) || aiWord(b, 49) & 1) continue;
    let attended = false;
    for (let i = l.owner * 5; i < l.owner * 5 + 5; i++) {
      if (
        !aiByte(s.specialists[i].native, 6) ||
        i === actor ||
        aiSByte(strategicBlueprint(s, i), 22) !== 0
      )
        continue;
      if (aiSWord(s.specialists[i].native, 127) % 64 === index % 64) {
        attended = true;
        break;
      }
    }
    if (attended) continue;
    const [kind, grade] = selectorGrade(s, index);
    if (aiSWord(b, 43) < c.rules.buildingHealth[kind * 3 + grade])
      repairCommand(s, l, actor, index, 0x37ed4, c);
    s.records[l.owner][0x47 + kind] = 1;
    return true;
  }
  return false;
}
function choosePower(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  preliminary: number,
  c: StrategicEngineerContext,
): number | null {
  const six = strategicEngineerBuildingAvailable(s, l.owner, 6, c.rules),
    eight = strategicEngineerBuildingAvailable(s, l.owner, 8, c.rules);
  if (six && eight)
    return site(s, l, actor, 15, preliminary, c).selector === 14 ? null : 15;
  return six ? 6 : eight ? 8 : null;
}
const sites37F30: BuildSites[] = [
  { plan: 0x38038, survey: 0x380eb, blocked: 0x3816e, command: 0x3826a },
  { plan: 0x3831e, survey: 0x383cd, blocked: 0x38452, command: 0x38550 },
  { plan: 0x38afe, survey: 0x38bca, blocked: 0x38c52, command: 0x38d50 },
  { plan: 0x3883d, survey: 0x38902, blocked: 0x3898f, command: 0x38aa0 },
  { plan: 0x38e5a, survey: 0x38f1a, blocked: 0x38fa0, command: 0x3909c },
];
/**37F30 early infrastructure, source production capacity and storage budget. */
export function planStrategicEngineerInfrastructure(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  c: StrategicEngineerContext,
): boolean {
  const ai = s.records[l.player],
    filter = ai[0x6bd],
    own = active(s, ai[4]);
  if (!own.length) {
    if (ai[0x52]) return true;
    if (
      cost(s, actor, 11, c) < funds(s, l) &&
      plannedBuild(s, l, actor, 11, sites37F30[0], c)
    )
      return true;
  }
  if (ai[0x5e7 + filter] === 64) {
    if (ai[0x4a]) return true;
    if (cost(s, actor, 3, c) < funds(s, l)) {
      plannedBuild(s, l, actor, 3, sites37F30[1], c);
      return true;
    }
  }
  if (l.capacity !== 0) {
    let supplied = 0;
    for (const index of matching(s, l)) {
      const [kind, grade] = selectorGrade(s, index);
      let amount = 0;
      if (kind === 3) amount = grade * 4;
      if (kind === 6) amount = grade + aiWord(s.missionPrefix, 0x1c5f);
      if (kind === 8) {
        if (!c.terrainHeight)
          throw Error(
            "Strategic Engineer7B140 terrain height is not implemented",
          );
        const h = c.terrainHeight(s, aiPoint(s.buildings[index], 7));
        if (!aiInteger(h, -0x80000000, 0x7fffffff))
          throw Error("Actual strategic terrain height required");
        let level = h >> 12;
        if (level <= 8) {
          const repeated = c.terrainHeight(s, aiPoint(s.buildings[index], 7));
          if (!aiInteger(repeated, -0x80000000, 0x7fffffff))
            throw Error("Actual strategic terrain height required");
          level = repeated >> 12;
        } else level = 8;
        amount = level * (grade + 1);
      }
      if (kind === 9) amount = (grade + 1) * 8;
      supplied = (supplied + amount) & 65535;
    }
    if (
      !(ai[0x625] * l.capacity <= supplied * 10 && s.players[l.owner][0x603])
    ) {
      if (matching(s, l, 3).length === 0) {
        if (ai[0x4a]) return true;
        plannedBuild(s, l, actor, 3, sites37F30[2], c);
        return true;
      }
      if (!ai[0x4f] && !ai[0x4d] && !ai[0x50]) {
        const kind = choosePower(s, l, actor, 0x387af, c);
        if (kind !== null) plannedBuild(s, l, actor, kind, sites37F30[3], c);
        return true;
      }
    }
  }
  if (
    strategicEngineerBuildingAvailable(s, l.owner, 0, c.rules) &&
    matching(s, l, 0).length === 0
  )
    return false;
  if (
    (aiDword(s.players[l.owner], 0x5e6) - 50) >>> 0 < funds(s, l) >>> 0 &&
    !ai[0x54]
  ) {
    plannedBuild(s, l, actor, 13, sites37F30[4], c);
    return true;
  }
  return false;
}
function canUpgrade(
  s: StrategicSpecialistPlannerState,
  index: number,
  c: StrategicEngineerContext,
): boolean {
  const n = s.buildings[index],
    flags = aiWord(n, 49),
    [kind, grade] = selectorGrade(s, index);
  return (
    (grade < aiByte(n, 47) && !(flags & 0x400)) ||
    (!!(flags & 1) &&
      strategicEngineerUpgradeAvailable(
        s,
        aiByte(n, 24),
        kind,
        grade + 1,
        c.rules,
      ))
  );
}
/**390D0 expansion query and exact source selected action dispatch. */
export function planStrategicEngineerDevelopment(
  s: StrategicSpecialistPlannerState,
  l: StrategicEngineerLocal,
  actor: number,
  c: StrategicEngineerContext,
): boolean {
  const ai = s.records[l.player],
    filter = ai[0x6bd];
  if (
    matching(s, l, 3).length <= 1 &&
    !ai[0x4a] &&
    strategicEngineerUpgradeAvailable(s, l.owner, 3, 1, c.rules)
  ) {
    plannedBuild(
      s,
      l,
      actor,
      3,
      { plan: 0x3923a, survey: 0x392f8, blocked: 0x39383, command: 0x394a0 },
      c,
    );
    return true;
  }
  let score = 0,
    action = 255,
    chosenKind = 14,
    chosen: number | null = null;
  for (let kind = 0; kind < 14; kind++) {
    if (
      !strategicEngineerBuildingAvailable(s, l.owner, kind, c.rules) ||
      c.rules.priorities[kind][0] <= score
    )
      continue;
    if (
      !matching(s, l, kind).length &&
      !ai[0x47 + kind] &&
      (aiDword(ai, 0xe + kind * 4) | 0) <= 0
    ) {
      score = c.rules.priorities[kind][0];
      chosenKind = kind;
      action = 0;
    }
  }
  for (const index of active(s, l.owner)) {
    const n = s.buildings[index],
      [kind, grade] = selectorGrade(s, index),
      flags = aiWord(n, 49);
    let candidate = -5000;
    //Repair/selector11 choices intentionally do not update the stored best
    //score. Later rows can replace those choices against the old threshold.
    if (flags & 0x40 || !(flags & 1)) {
      candidate = c.rules.buildingValues[kind][grade] * 2;
      if (candidate > score) {
        action = 2;
        chosen = index;
      }
    }
    if (kind === 11 && flags & 0x200 && !(flags & 0x1000)) {
      candidate = c.rules.buildingValues[kind][grade];
      if (candidate > score) {
        action = 3;
        chosen = index;
      }
    }
    if (grade < 2)
      candidate =
        c.rules.priorities[kind][grade + 1] +
        aiSByte(s.records[l.owner], 0x627);
    if (canUpgrade(s, index, c) && candidate > score) {
      score = candidate;
      action = 1;
      chosen = index;
    }
  }
  if (action === 0) {
    if (chosenKind > 13 || cost(s, actor, chosenKind, c) > funds(s, l))
      return false;
    plannedBuild(
      s,
      l,
      actor,
      chosenKind,
      { plan: 0x39bd5, survey: 0x39c84, blocked: 0x39d1e, command: 0x39e4e },
      c,
    );
    return true;
  }
  if (action === 1 && chosen !== null) {
    if (canUpgrade(s, chosen, c)) {
      issueStrategicRoleCommand(s, c, {
        routine: 0x81080,
        source: 0x39883,
        player: s.records[l.owner][4],
        specialist: actor,
        packet: strategicRolePacket(
          s,
          c,
          0x39883,
          { 0: actor, 2: 0x40a, 4: aiWord(s.buildings[chosen], 15) << 8 },
          5,
        ),
      });
      s.records[l.owner][0x46] = aiSWord(s.buildings[chosen], 15) % 64;
    }
    return false;
  }
  if (action === 2 && chosen !== null) {
    const [kind, grade] = selectorGrade(s, chosen);
    if (
      aiSWord(s.buildings[chosen], 43) <
      c.rules.buildingHealth[kind * 3 + grade]
    )
      repairCommand(s, l, actor, chosen, 0x39990, c);
    return false;
  }
  if (action === 3 && chosen !== null) {
    issueStrategicRoleCommand(s, c, {
      routine: 0x81080,
      source: 0x39a12,
      player: s.records[l.owner][4],
      specialist: actor,
      packet: strategicRolePacket(
        s,
        c,
        0x39a12,
        { 0: actor, 2: 0x10b, 4: aiWord(s.buildings[chosen], 15) << 8 },
        5,
      ),
    });
    return false;
  }
  if (
    !l.expansion &&
    filter < 5 &&
    filter === ai[0x95] &&
    !active(s, ai[4]).some(
      (i) => ai[0x55 + (i % 64)] === ((filter + 1) & 255),
    ) &&
    ai[0x95] < ai[0x626]
  ) {
    const first = active(s, ai[4]).filter((i) => ai[0x55 + (i % 64)] === 1);
    let point: [number, number] = aiPoint(s.players[l.owner], 9);
    if (first.length) {
      let x = 0,
        y = 0;
      for (const index of first) {
        x += Math.trunc(aiSWord(s.buildings[index], 7) / 256);
        y += Math.trunc(aiSWord(s.buildings[index], 9) / 256);
      }
      point = [
        Math.trunc(x / first.length) << 8,
        Math.trunc(y / first.length) << 8,
      ];
    }
    let interval = ai[0x658] ? Math.trunc(2048 / ai[0x658]) : 256;
    if (!interval || interval > 2048) interval = 256;
    const radius = ai[0x634] * 256;
    if (!c.expansionSite)
      throw Error(
        "Strategic Engineer320E0 expansion survey is not implemented",
      );
    const result = c.expansionSite(s, {
      routine: 0x320e0,
      source: 0x3a0e7,
      owner: l.owner,
      point,
      interval,
      radius,
      extentSquared: Math.imul(radius, radius) >>> 0,
      predicate: 0x32230,
    });
    if (
      result?.routine !== 0x320e0 ||
      (result.point !== null &&
        (!Array.isArray(result.point) ||
          result.point.length !== 2 ||
          result.point.some((v) => !aiInteger(v, -32768, 32767))))
    )
      throw Error("Actual strategic expansion survey result required");
    if (result.point) {
      ai[0x95] = (ai[0x95] + 1) & 255;
      aiPutDword(
        ai,
        0x6aa,
        (result.point[0] & 65535) | (result.point[1] << 16),
      );
      l.expansion = true;
    } else {
      ai[0x626] = ai[0x95];
      if (ai[0x95] < ai[0x6bd]) ai[0x6bd] = 1;
    }
  }
  return false;
}
export function planStagedStrategicEngineer(
  s: StrategicSpecialistPlannerState,
  player: number,
  actor: number,
  c: StrategicEngineerContext,
): StrategicEngineerReceipt {
  if (!aiInteger(player, 0, 3))
    throw Error("Actual strategic Engineer player required");
  specialistLocalIndex(s, actor);
  validateStrategicEngineerRules(c.rules);
  const ai = s.records[player],
    l: StrategicEngineerLocal = {
      player,
      owner: ai[4],
      capacity: 0,
      expansion: false,
    };
  for (const index of matching(s, l))
    l.capacity =
      (l.capacity + c.rules.upkeep[selectorGrade(s, index)[0]]) & 65535;
  ai[0x60f] = 4;
  if (!ai[0x639]) {
    ai[0x60f] = 5;
    if (planStrategicEngineerRepair(s, l, actor, c)) ai[0x60f] = 23;
    else if (planStrategicEngineerInfrastructure(s, l, actor, c)) ai[0x60f] = 6;
    else if (planStrategicEngineerDevelopment(s, l, actor, c)) ai[0x60f] = 7;
    else ai[0x60f] = 8;
  }
  return {
    routine: 0x37c50,
    player,
    specialist: actor,
    result: true,
    capacity: l.capacity,
    expansion: l.expansion,
  };
}
export function stepStrategicEngineer(
  s: StrategicSpecialistPlannerState,
  player: number,
  actor: number,
  c: StrategicEngineerContext,
): {
  state: StrategicSpecialistPlannerState;
  receipt: StrategicEngineerReceipt;
} {
  validateStrategicAIState(s);
  validateStrategicPlannerMetadata(s);
  const state = cloneStrategicSpecialistPlanner(s),
    receipt = planStagedStrategicEngineer(state, player, actor, c);
  validateStrategicAIState(state);
  validateStrategicPlannerMetadata(state);
  return { state, receipt };
}
export function makeStrategicEngineerPlanningService(
  c: StrategicEngineerContext,
) {
  return (
    s: StrategicSpecialistPlannerState,
    request: StrategicEngineerPlanRequest,
  ): StrategicEngineerReceipt =>
    planStagedStrategicEngineer(s, request.player, request.specialist, c);
}
