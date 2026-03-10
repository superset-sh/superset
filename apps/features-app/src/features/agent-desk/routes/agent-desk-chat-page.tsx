import { useParams } from "@tanstack/react-router";
import { Chat } from "../pages/chat";

export function AgentDeskChatPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };

  return (
    <div className="h-[calc(100dvh-4rem)]">
      <Chat key={sessionId} sessionId={sessionId} />
    </div>
  );
}
