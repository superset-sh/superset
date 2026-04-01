import { notFound, redirect } from "next/navigation";
import {
	getLatestMockSessionByWorkspaceId,
	getMockDiffFilesForSession,
	getMockMessagesForSession,
	getMockWorkspaceById,
} from "../../../mock-data";
import { getAgentsUiAccess } from "../../../utils/getAgentsUiAccess";
import { SessionPageContent } from "./components/SessionPageContent";

export default async function WorkspaceDetailPage({
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
	const session = workspace
		? getLatestMockSessionByWorkspaceId(workspace.id)
		: undefined;

	if (!workspace || !session) {
		notFound();
	}

	return (
		<SessionPageContent
			diffFiles={getMockDiffFilesForSession(session.id)}
			messages={getMockMessagesForSession(session.id)}
			session={session}
		/>
	);
}
