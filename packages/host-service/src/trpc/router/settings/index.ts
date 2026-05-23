import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { HostWorktreeLocationSettings } from "./worktree-location";
