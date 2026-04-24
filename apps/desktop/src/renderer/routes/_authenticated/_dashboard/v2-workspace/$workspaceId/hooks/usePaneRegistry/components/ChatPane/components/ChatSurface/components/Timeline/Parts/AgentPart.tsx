import type { AgentPart } from "@superset/chat/shared";
import type { PartProps } from "./parts";

export function AgentPartView({ part }: PartProps<AgentPart>) {
	return (
		<span className="text-muted-foreground my-1 inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[11px]">
			@{part.name}
		</span>
	);
}
