import { aiPutDword, aiPutWord } from "../../src/sim/mechanics/strategic-ai";
import type {
  StrategicEngineerContext,
  StrategicEngineerRules,
} from "../../src/sim/mechanics/strategic-ai-engineer";
import { strategicSpecialistFixture } from "./strategic-specialists";
export function strategicEngineerFixture() {
  const f = strategicSpecialistFixture(0),
    { a, p, s } = f;
  p[0x4a1] = 1;
  p[0x6e7] = 15;
  p[0x603] = 1;
  p[0x602] = 0;
  aiPutDword(p, 0x4a3, 1000);
  aiPutDword(p, 0x4a7, 0);
  aiPutDword(p, 0x5e6, 500);
  a.fill(0, 0x5e7, 0x5f5);
  a[0x54] = 1;
  for (let kind = 0; kind < 14; kind++) aiPutDword(a, 0xe + kind * 4, 1);
  const rules: StrategicEngineerRules = {
      upkeep: Array(14).fill(0),
      buildingHealth: Array(42).fill(300),
      constructionCosts: Array(14).fill(100),
      buildingFootprints: Array(14).fill(3),
      buildingProgressThresholds: Array(42).fill(0),
      buildingPrerequisites: Array(14).fill(255),
      buildingValues: Array.from({ length: 14 }, () => [10, 20, 30]),
      priorities: Array.from({ length: 14 }, () => [0, 0, 0]),
    },
    c: StrategicEngineerContext = {
      command: f.c.command,
      rules,
      planSite: (_w, r) => {
        f.calls.push(structuredClone(r));
        return {
          routine: 0x3a1e0,
          selector: r.selector === 15 ? 6 : r.selector,
          point: [12000, 13000],
        };
      },
      siteBlocked: (_w, r) => {
        f.calls.push(structuredClone(r));
        return { routine: 0x74e80, blocked: false };
      },
      resourceScore: (_w, r) => {
        f.calls.push(structuredClone(r));
        return { routine: 0x8d930, score: 300 };
      },
      terrainHeight: (_w, point) => {
        f.calls.push({ routine: 0x7b140, point });
        return 4096;
      },
      expansionSite: (_w, r) => {
        f.calls.push(structuredClone(r));
        return { routine: 0x320e0, point: [14000, 15000] };
      },
    };
  function building(
    slot: number,
    kind: number,
    grade = 2,
    flags = 1,
    health = 300,
    classification = 0,
  ) {
    const n = s.buildings[64 + slot];
    n[6] = 4;
    n[45] = kind;
    n[46] = grade;
    n[47] = 2;
    aiPutWord(n, 7, 10000 + slot * 256);
    aiPutWord(n, 9, 10000);
    aiPutWord(n, 49, flags);
    aiPutWord(n, 43, health);
    a[0x55 + slot] = classification;
    return n;
  }
  return { ...f, specialistContext: f.c, rules, c, building };
}
