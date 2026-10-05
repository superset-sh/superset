import { LuBox } from "react-icons/lu";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { CloudWorkspaceStatus } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceStatus";

interface TaskWorkspaceRowProps {
	workspace: Pick<
		CloudWorkspaceRow,
		"name" | "status" | "agentStatus" | "agentStatusAt"
	>;
	now: Date;
	onOpen: () => void;
}

export function TaskWorkspaceRow({
	workspace,
	now,
	onOpen,
}: TaskWorkspaceRowProps) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex h-7 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
		>
			<LuBox className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate">{workspace.name}</span>
			<span className="flex shrink-0 text-muted-foreground">
				<CloudWorkspaceStatus workspace={workspace} isRead now={now} />
			</span>
		</button>
	);
}
