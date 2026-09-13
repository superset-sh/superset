import { router } from "../../index";
import { archive } from "./archive";
import { workspaceCleanupRouter as lifecycleRouter } from "./workspace-cleanup";

export { reviveWorkspace } from "./revive";
export { destroyWorkspace } from "./workspace-cleanup";

export const workspaceCleanupRouter = router({
	...lifecycleRouter._def.record,
	archive,
});
