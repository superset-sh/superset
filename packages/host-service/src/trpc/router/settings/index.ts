import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";
import { sandboxDefaultsRouter } from "./sandbox-defaults";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
	sandboxDefaults: sandboxDefaultsRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type {
	HostSandboxDefaults,
	SandboxProvider,
} from "./sandbox-defaults";
export type { HostWorktreeLocationSettings } from "./worktree-location";
