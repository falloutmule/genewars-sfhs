import { aiPutWord } from "../../src/sim/mechanics/strategic-ai";
import type { StrategicSpecialistPlanContext } from "../../src/sim/mechanics/strategic-ai-specialists";
import type { StrategicSpecialistPlannerState } from "../../src/sim/mechanics/strategic-ai-specialists-state";
import { aiGroupFixture } from "./strategic-ai";
export function strategicSpecialistFixture(category = 2) {
  const base = aiGroupFixture(0, 7, 0),
    s = base.s as StrategicSpecialistPlannerState,
    a = s.records[1],
    p = s.players[1],
    n = s.specialists[5].native,
    calls: unknown[] = [];
  p[3] = 1;
  p[4] = 5;
  a[0x6b1] = 1;
  a[0x46] = 64;
  s.specialists[5].blueprint = { player: 1, index: 0 };
  n[6] = 3;
  n[85] = 1;
  n[131] = 14;
  aiPutWord(n, 7, 10000);
  aiPutWord(n, 9, 10000);
  p[0x16] = 65;
  p[0x16 + 22] = category;
  p[0x16 + 23] = 20;
  p[0x16 + 24] = 40;
  p[0x16 + 25] = 30;
  p[0x16 + 26] = 10;
  p[0x16 + 27] = 30;
  const c: StrategicSpecialistPlanContext = {
    ...base.c,
    tables: {
      atan: Array.from({ length: 257 }, (_, i) =>
        Math.round((Math.atan(i / 256) * 1024) / Math.PI),
      ),
      sine: Array.from({ length: 2048 }, (_, i) =>
        Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
      ),
      cosine: Array.from({ length: 2048 }, (_, i) =>
        Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
      ),
    },
    command: (_w, r) => {
      calls.push(structuredClone(r));
      return {
        routine: r.routine,
        player: r.player,
        specialist: r.specialist,
        outcome: "ignored",
      };
    },
    engineerPlan: (_w, r) => {
      calls.push({ ...r });
      return { ...r, result: false };
    },
    freePoint: (_w, r) => {
      calls.push(structuredClone(r));
      return { routine: 0x30f10, point: [12300, 12400], retryDecrement: 1 };
    },
    plantDensity: (_w, r) => {
      calls.push(structuredClone(r));
      return { routine: 0x8d930, count: 5 };
    },
    plantStyle: (_w, r) => {
      calls.push(structuredClone(r));
      return {
        routine: r.routine,
        found: true,
        point: [12000, 13000],
        style: 2,
      };
    },
  };
  return { ...base, s, a, p, n, c, calls };
}
