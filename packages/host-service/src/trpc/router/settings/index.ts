import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
});

export type { HostAgentConfig } from "./agent-configs";
