import { TELEPORT_STEPS } from "@superset/shared/teleport";
import type { TeleportRunState } from "../../types";

export type TeleportRunOutcome = "running" | "done" | "failed";

/** What the step map says about the run as a whole. */
export function deriveRunOutcome(run: TeleportRunState): TeleportRunOutcome {
	if (run.error !== null) return "failed";
	const allDone = TELEPORT_STEPS.every((step) => run.steps[step] === "done");
	return allDone ? "done" : "running";
}
