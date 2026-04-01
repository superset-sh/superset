import { notFound, redirect } from "next/navigation";
import { AgentPromptInput } from "../../components/AgentPromptInput";
import { AgentsHeader } from "../../components/AgentsHeader";
import { SessionList } from "../../components/SessionList";
import {
	getMockSessionsByWorkspaceId,
	getMockWorkspaceById,
} from "../../mock-data";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";

export default async function WorkspacePage({
	params,
}: {
	params: Promise<{ workspaceId: string }>;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (!hasAgentsUiAccess) {
		redirect("/");
	}

	const { workspaceId } = await params;
	const workspace = getMockWorkspaceById(workspaceId);

	if (!workspace) {
		notFound();
	}

	const sessions = getMockSessionsByWorkspaceId(workspace.id);

	return (
		<>
			<AgentsHeader />
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
				<div className="flex flex-col gap-1 px-1">
					<p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
						Workspace
					</p>
					<h1 className="text-lg font-medium">{workspace.name}</h1>
					<p className="text-sm text-muted-foreground">
						{workspace.repoFullName} · {workspace.branch}
					</p>
				</div>
				<AgentPromptInput workspace={workspace} />
				<SessionList sessions={sessions} workspaceId={workspace.id} />
			</div>
		</>
	);
}
