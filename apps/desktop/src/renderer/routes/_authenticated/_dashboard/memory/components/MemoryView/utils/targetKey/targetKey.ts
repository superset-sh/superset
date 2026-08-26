import type { AgentMemoryTarget } from "@superset/host-service/agent-memory";

/** Stable string identity for a memory-file target (selection + query keys). */
export function targetKey(target: AgentMemoryTarget): string {
	switch (target.kind) {
		case "global":
			return "global";
		case "project":
			return `project:${target.projectId}`;
		case "auto-memory":
			return `auto:${target.projectId}:${target.fileName}`;
		case "workspace":
			return `workspace:${target.workspaceId}`;
		case "workspace-auto-memory":
			return `workspace-auto:${target.workspaceId}:${target.fileName}`;
	}
}
