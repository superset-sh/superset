import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { baseRefFetchRouter } from "./base-ref-fetch";
import { branchPrefixRouter } from "./branch-prefix";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	baseRefFetch: baseRefFetchRouter,
	branchPrefix: branchPrefixRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { HostWorktreeLocationSettings } from "./worktree-location";
