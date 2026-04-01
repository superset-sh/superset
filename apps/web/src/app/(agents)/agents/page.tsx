import { redirect } from "next/navigation";
import { AgentsHeader } from "../components/AgentsHeader";
import { WorkspaceBrowser } from "../components/WorkspaceBrowser";
import {
	getMockProjects,
	getMockSessions,
	getMockWorkspaces,
} from "../mock-data";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";

export default async function AgentsWorkspaceBrowserPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (!hasAgentsUiAccess) {
		redirect("/");
	}

	return (
		<>
			<AgentsHeader />
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
				<div className="flex flex-col gap-1 px-1">
					<p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
						Agents
					</p>
					<h1 className="text-lg font-medium">Workspaces</h1>
					<p className="text-sm text-muted-foreground">
						Browse workspaces by project before opening an active workspace.
					</p>
				</div>
				<WorkspaceBrowser
					projects={getMockProjects()}
					sessions={getMockSessions()}
					workspaces={getMockWorkspaces()}
				/>
			</div>
		</>
	);
}
