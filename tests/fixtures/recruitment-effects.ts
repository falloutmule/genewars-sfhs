import type { Pack } from "../../src/content/types";
/** Synthetic descriptors for source special-entry64 and its real51 child.
 * Existing animation profiles remain untouched. No original data is included. */
export function addRecruitmentEffectFixture(pack: Pack): void {
  const eff = structuredClone(pack.assets.EFF), frame = eff.frames![0];
  while (eff.animations!.length < 71) eff.animations!.push({first: 0, last: 1, rawTrailingWord: 2});
  for (const [code, count, hold] of [[64, 5, 1], [51, 23, 0]]) {
    const first = eff.frames!.length;
    for (let i = 0; i < count; i++) eff.frames!.push({...structuredClone(frame), rawFlags: [hold, 0, 0]});
    eff.animations![code] = {first, last: first + count - 1, rawTrailingWord: count};
  }
  pack.assets.EFF = eff;
  pack.effectRules = {schemaVersion: 1, descriptors: Array.from({length: 71}, (_, code) => ({code,
    retirementMode: code === 64 ? 6 : 0, gravity: code === 64, priority: code === 51 ? 2 : 1,
    childCode: code === 64 ? 51 : null, movable: code === 64, waterResponse: code === 64})),
    provenance: {executableSha256: "0".repeat(64), originalExecution: false}};
}
