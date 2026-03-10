import { useParams, useSearch } from "@tanstack/react-router";
import { Terminal } from "../pages/terminal";

export function AgentDeskTerminalPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const search = useSearch({ strict: false }) as { autoStart?: boolean };

  return (
    <div className="h-[calc(100dvh-4rem)]">
      <Terminal sessionId={sessionId} autoStart={search.autoStart === true} />
    </div>
  );
}
