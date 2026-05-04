import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
});

export type { HostAgentConfigDto } from "./agent-configs";
export type { AgentPreset, PromptTransport } from "./agent-presets";
