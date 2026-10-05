/**
 * The plan vocabulary lives in `@superset/shared/teleport` so the renderer
 * can render a review dialog without importing host-service (and with it,
 * `node:child_process`). This module exists so the rest of the teleport core
 * has one local place to reach for it.
 */
export {
	type BuildTeleportPlanInput,
	buildTeleportPlan,
	derivePaneDisposition,
	type PaneDisposition,
	type PanePlan,
	type TabPlan,
	TELEPORT_STEPS,
	type TeleportPlan,
	type TeleportRefusal,
	type TeleportStepId,
	type WorkingTreeSummary,
} from "@superset/shared/teleport";
