import { createFileRoute } from "@tanstack/react-router";
import { AgentLibrarySettings } from "./components/AgentLibrarySettings";

export const Route = createFileRoute("/_authenticated/settings/agent-library/")(
	{
		component: AgentLibrarySettings,
	},
);
