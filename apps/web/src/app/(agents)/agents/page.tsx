import { COMPANY, DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { FaGithub } from "react-icons/fa";
import { ProductDemo } from "../../(dashboard-legacy)/components/ProductDemo";
import { AgentPromptInput } from "../components/AgentPromptInput";
import { AgentsHeader } from "../components/AgentsHeader";
import { SessionList } from "../components/SessionList";
import {
	getDefaultMockWorkspace,
	getMockSessionsByWorkspaceId,
} from "../mock-data";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";

export default async function AgentsPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (hasAgentsUiAccess) {
		const workspace = getDefaultMockWorkspace();

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

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col items-center gap-6 text-center">
				<div>
					<h1 className="mb-3 text-3xl font-medium">Download Superset</h1>
					<p className="text-muted-foreground">
						Use the desktop app to start running parallel coding agents.
					</p>
				</div>

				<div className="flex flex-wrap justify-center gap-3">
					<Button size="lg" className="gap-2" asChild>
						<a href={DOWNLOAD_URL_MAC_ARM64}>
							Download for Mac
							<Download className="size-5" />
						</a>
					</Button>
					<Button variant="outline" size="lg" className="gap-2" asChild>
						<a
							href={COMPANY.GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							View on GitHub
							<FaGithub className="size-5" />
						</a>
					</Button>
				</div>
			</div>

			<ProductDemo />
		</div>
	);
}
