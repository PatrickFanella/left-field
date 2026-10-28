import type { IntakeSpec } from "../package";
import { northCarolinaLocalGeneralSpec } from "./north-carolina-local-general";

/**
 * Live intake specs. Adding a state is one entry here plus its spec module.
 *
 * `ohio-state-legislative` is the worked example that reproduces the frozen
 * Ohio v1 catalog through the shared builder; it is exercised by its test but
 * not registered, because the v1 artifact already covers those workbooks.
 */
export const INTAKE_SPECS: readonly IntakeSpec[] = [northCarolinaLocalGeneralSpec];
