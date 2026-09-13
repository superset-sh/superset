import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { AgentTreeNodeStatus } from "../../../../utils/buildAgentTree";

export function AgentTreeStatusGlyph({
	status,
}: {
	status: AgentTreeNodeStatus;
}) {
	switch (status) {
		case "working":
			return <StatusIndicator status="working" />;
		case "waiting":
			return <StatusIndicator status="permission" />;
		case "failed":
			return <StatusIndicator status="failed" />;
		case "review":
			return <StatusIndicator status="review" />;
		case "completed":
			return (
				<span className="inline-flex size-2 shrink-0 rounded-full bg-green-500/70" />
			);
		case "stopped":
			return (
				<span className="inline-flex size-[7px] shrink-0 rounded-[1px] bg-muted-foreground/60" />
			);
		case "idle":
			return (
				<span className="inline-flex size-2 shrink-0 rounded-full border border-muted-foreground/60" />
			);
	}
}
