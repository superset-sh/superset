import type { AgentMemoryTarget } from "@superset/host-service/agent-memory";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useEffect, useState } from "react";
import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import { splitFrontMatter } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer/splitFrontMatter";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	AGENT_MEMORY_FILES_QUERY_KEY,
	AGENT_MEMORY_LIST_QUERY_KEY,
} from "../../constants";
import { targetKey } from "../../utils/targetKey";

interface MemoryEditorProps {
	hostUrl: string;
	presetId: string;
	target: AgentMemoryTarget;
	label: string;
}

interface EditorState {
	draft: string;
	/** What the draft is diffed against for dirtiness. */
	baselineContent: string;
	/** Revision the draft is based on; null = file didn't exist when loaded. */
	baselineRevision: string | null;
}

const getQueryKey = (
	hostUrl: string,
	presetId: string,
	target: AgentMemoryTarget,
) => ["agent-memory", hostUrl, presetId, targetKey(target)] as const;

function isConflictError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "CONFLICT";
}

/** Mount keyed on host + agent + target (see MemoryView) so state never leaks across. */
export function MemoryEditor({
	hostUrl,
	presetId,
	target,
	label,
}: MemoryEditorProps) {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: getQueryKey(hostUrl, presetId, target),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).agentMemory.get.query({
				agent: presetId,
				target,
			}),
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
	});

	const [editorState, setEditorState] = useState<EditorState | null>(null);

	const data = query.data;
	// Adopt server content on first load and on external changes while clean.
	// A dirty draft is never clobbered — the stale baseline then makes the
	// next save CONFLICT, which is the honest outcome.
	useEffect(() => {
		if (!data) return;
		setEditorState((prev) => {
			if (prev !== null && prev.draft !== prev.baselineContent) return prev;
			if (prev !== null && prev.baselineRevision === data.revision) return prev;
			return {
				draft: data.content ?? "",
				baselineContent: data.content ?? "",
				baselineRevision: data.revision,
			};
		});
	}, [data]);

	const writeMutation = useMutation({
		mutationFn: (input: { content: string; expectedRevision: string | null }) =>
			getHostServiceClientByUrl(hostUrl).agentMemory.write.mutate({
				agent: presetId,
				target,
				...input,
			}),
	});

	const reloadFromDisk = async () => {
		const result = await query.refetch();
		const fresh = result.data;
		if (!fresh) return;
		setEditorState({
			draft: fresh.content ?? "",
			baselineContent: fresh.content ?? "",
			baselineRevision: fresh.revision,
		});
	};

	const handleSave = () => {
		if (!editorState || writeMutation.isPending) return;
		if (editorState.draft === editorState.baselineContent) return;
		const contentToSave = editorState.draft;
		writeMutation.mutate(
			{
				content: contentToSave,
				expectedRevision: editorState.baselineRevision,
			},
			{
				onSuccess: ({ revision }) => {
					// Re-baseline without remounting so the cursor survives typing
					// that happened while the save was in flight.
					setEditorState((prev) =>
						prev
							? {
									...prev,
									baselineContent: contentToSave,
									baselineRevision: revision,
								}
							: prev,
					);
					queryClient.setQueryData(
						getQueryKey(hostUrl, presetId, target),
						(old: typeof data) =>
							old
								? { ...old, content: contentToSave, revision, exists: true }
								: old,
					);
					// A first save flips exists — refresh the rail counts and the
					// file list's exists/size columns.
					void queryClient.invalidateQueries({
						queryKey: AGENT_MEMORY_LIST_QUERY_KEY,
					});
					void queryClient.invalidateQueries({
						queryKey: AGENT_MEMORY_FILES_QUERY_KEY,
					});
				},
				onError: (error) => {
					if (isConflictError(error)) {
						toast.error("Memory file changed on disk", {
							description:
								"Another process — likely the agent itself — rewrote it since you loaded it. Loading the latest discards your edit.",
							action: {
								label: "Load latest",
								onClick: () => void reloadFromDisk(),
							},
						});
						return;
					}
					toast.error(
						error instanceof Error ? error.message : "Failed to save memory",
					);
				},
			},
		);
	};

	if (query.isError) {
		return (
			<div className="p-6 text-sm text-destructive">
				Couldn't load {label}'s memory:{" "}
				{query.error instanceof Error ? query.error.message : "unknown error"}
				<Button
					variant="outline"
					size="xs"
					className="ml-3"
					onClick={() => void query.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	if (!data || editorState === null) {
		return (
			<div className="space-y-4 p-6">
				<Skeleton className="h-6 w-64" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}

	const dirty = editorState.draft !== editorState.baselineContent;
	// TipTap mangles YAML front matter (no node for it) — keep it out of the
	// editor and re-attach the verbatim block to every emission.
	const { frontMatter, body } = splitFrontMatter(editorState.draft);

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">{label}</div>
					<div className="truncate font-mono text-xs text-muted-foreground">
						{data.path}
						{!data.exists && !dirty && " — created on first save"}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{frontMatter !== "" && (
						<span className="text-xs text-muted-foreground">
							Front matter hidden — preserved on save
						</span>
					)}
					{dirty && (
						<Button
							variant="outline"
							size="xs"
							disabled={writeMutation.isPending}
							onClick={handleSave}
						>
							{writeMutation.isPending && <Spinner className="size-3" />}
							Save
						</Button>
					)}
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<TipTapMarkdownRenderer
					value={body}
					editable
					preserveSourceFormatting
					className="px-6 py-4"
					onChange={(next) =>
						setEditorState((prev) =>
							prev ? { ...prev, draft: frontMatter + next } : prev,
						)
					}
					onSave={handleSave}
				/>
			</div>
		</div>
	);
}
