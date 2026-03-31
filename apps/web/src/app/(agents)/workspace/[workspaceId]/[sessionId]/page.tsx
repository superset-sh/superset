import { notFound, redirect } from "next/navigation";
import {
	getMockDiffFilesForSession,
	getMockMessagesForSession,
	getMockSessionById,
	getMockWorkspaceById,
} from "../../../mock-data";
import { getAgentsUiAccess } from "../../../utils/getAgentsUiAccess";
import { SessionPageContent } from "../../../[sessionId]/components/SessionPageContent";

export default async function WorkspaceSessionPage({
	params,
}: {
	params: Promise<{ sessionId: string; workspaceId: string }>;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (!hasAgentsUiAccess) {
		redirect("/");
	}

	const { sessionId, workspaceId } = await params;
	const workspace = getMockWorkspaceById(workspaceId);
	const session = getMockSessionById(sessionId);

	if (!workspace || !session || session.workspaceId !== workspace.id) {
		notFound();
	}

	return (
		<SessionPageContent
			diffFiles={getMockDiffFilesForSession(session.id)}
			messages={getMockMessagesForSession(session.id)}
			session={session}
			workspace={workspace}
		/>
	);
}
