import { notFound, redirect } from "next/navigation";
import { mockSessions } from "../mock-data";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { SessionPageContent } from "./components/SessionPageContent";

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
	const session = mockSessions.find((candidate) => candidate.id === sessionId);

	if (!session) {
		notFound();
	}

	return <SessionPageContent session={session} />;
}
