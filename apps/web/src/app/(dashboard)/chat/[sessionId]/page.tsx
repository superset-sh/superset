import { ChatRoom } from "./components/ChatRoom";

interface ChatSessionPageProps {
	params: Promise<{ sessionId: string }>;
}

export default async function ChatSessionPage({
	params,
}: ChatSessionPageProps) {
	const { sessionId } = await params;

	return <ChatRoom sessionId={sessionId} />;
}
