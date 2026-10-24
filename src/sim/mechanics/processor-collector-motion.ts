/**Actual native97 kind7 access to the one6FB60 ground driver. */
import {
  stepStagedCollectorGroundMotion,
  type SpecialistMotionContext,
  type SpecialistMotionReceipt,
} from "./specialist-motion";
import type { GeneticistWorld } from "./geneticist";
import {
  collectorByte,
  type ProcessorCollectorWorld,
} from "./processor-collector";
export interface ProcessorCollectorMotionContext<
  W extends GeneticistWorld & ProcessorCollectorWorld,
> extends Omit<SpecialistMotionContext<W>, "reveal"> {
  /**Actual14290, not a specialist command queue or replacement native. */
  cancel(world: W, index: number): void;
}
export function stepStagedProcessorCollectorMotion<
  W extends GeneticistWorld & ProcessorCollectorWorld,
>(
  s: W,
  index: number,
  c: ProcessorCollectorMotionContext<W>,
): SpecialistMotionReceipt {
  return stepStagedCollectorGroundMotion(
    s,
    index,
    {
      ...c,
      //Kind7 virtual2C=1EAF0 is exactly RET.
      reveal: () => {},
    },
    {
      native: (w, i) => w.collectors.records[i],
      dead: (w, i) => collectorByte(w.collectors.records[i], 86) === 3,
      blockedIdle: (w, i) => c.cancel(w, i),
    },
  );
}
