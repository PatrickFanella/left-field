import type { StatePrimaryAdapter } from "../state-primary-results-2026";
import { COLORADO_PRIMARY } from "./colorado";

/**
 * One adapter per covered state. Each reads that state's retained official
 * 2026 primary returns and reports raw contests; normalization and count
 * checks live in state-primary-results-2026.ts.
 */
export const STATE_PRIMARY_ADAPTERS: readonly StatePrimaryAdapter[] = [COLORADO_PRIMARY];
