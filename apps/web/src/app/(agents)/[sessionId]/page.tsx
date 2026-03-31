import { notFound, redirect } from "next/navigation";
import { getMockSessionById } from "../mock-data";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";

export default async function SessionPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
	}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (!hasAgentsUiAccess) {
		redirect("/");
	}

	const { sessionId } = await params;
	const session = getMockSessionById(sessionId);

	if (!session) {
		notFound();
	}

	redirect(`/workspace/${session.workspaceId}/${session.id}`);
}
