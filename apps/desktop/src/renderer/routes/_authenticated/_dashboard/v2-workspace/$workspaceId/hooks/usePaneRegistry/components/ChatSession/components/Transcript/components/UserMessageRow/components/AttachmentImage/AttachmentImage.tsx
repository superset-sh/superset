import { Badge } from "@superset/ui/badge";
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function AttachmentImage({
	path,
	type,
}: {
	path: string;
	type: string;
}) {
	const { workspaceId } = useChatPaneActions();
	const name = path.split("/").pop() ?? path;
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: Boolean(workspaceId) },
	);
	const worktreePath = workspace?.worktreePath;
	const { data, isPending, isError } =
		workspaceTrpc.filesystem.readFile.useQuery(
			{
				workspaceId: workspaceId ?? "",
				absolutePath: `${worktreePath}/${path}`,
				maxBytes: MAX_THUMBNAIL_BYTES,
			},
			{
				enabled: Boolean(workspaceId && worktreePath),
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
			},
		);
	const [unrenderable, setUnrenderable] = useState(false);
	if (
		!workspaceId ||
		isError ||
		unrenderable ||
		(data && (data.kind !== "bytes" || data.exceededLimit))
	)
		return <Badge variant="secondary">{name}</Badge>;
	if (isPending || !data)
		return (
			<div className="size-40 animate-pulse rounded-2xl bg-foreground/10" />
		);
	return (
		<img
			alt={name}
			className="size-40 rounded-2xl border border-border object-cover"
			draggable={false}
			onError={() => setUnrenderable(true)}
			src={`data:${type};base64,${data.content}`}
		/>
	);
}
