import { Trans } from "@lingui/react/macro";
import { workspaceTrpc } from "@superset/workspace-client";
import { type ReactNode, useMemo } from "react";
import { LuLoader } from "react-icons/lu";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import {
	type ContentState,
	decodeBase64,
	type SharedFileDocument,
	useSharedFileDocument,
} from "../../../../../../../../state/fileDocumentStore";
import type { ChangesetFile } from "../../../../../../../useChangeset";
import type { FileView } from "../../../../../FilePane/registry";
import { createGetDiffInput } from "../../../../utils/createGetDiffInput";
import { hashString } from "../../../../utils/hashString";
import { createSnapshotDocument } from "../../utils/createSnapshotDocument";

export type DiffSide = "old" | "new";

interface DiffSidePreviewProps {
	file: ChangesetFile;
	side: DiffSide;
	view: FileView;
	workspaceId: string;
	worktreePath: string;
}

/** One side of a binary file's diff, rendered by the FilePane registry view
 * that owns the file type. The unstaged "new" side is the working tree and
 * comes through the shared document store like an open file tab would, so
 * the two never disagree and the store's fs watch keeps it fresh. Every other
 * side is a git object (index, HEAD, merge-base, commit) read on demand. */
export function DiffSidePreview(props: DiffSidePreviewProps) {
	const isWorktree =
		props.side === "new" && props.file.source.kind === "unstaged";
	return isWorktree ? (
		<WorktreeSide {...props} />
	) : (
		<GitObjectSide {...props} />
	);
}

function WorktreeSide({
	file,
	view,
	workspaceId,
	worktreePath,
}: DiffSidePreviewProps) {
	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: toAbsoluteWorkspacePath(worktreePath, file.path),
	});
	return (
		<SideBody
			document={document}
			view={view}
			filePath={file.path}
			workspaceId={workspaceId}
		/>
	);
}

function GitObjectSide({
	file,
	side,
	view,
	workspaceId,
	worktreePath,
}: DiffSidePreviewProps) {
	const path = side === "old" ? (file.oldPath ?? file.path) : file.path;
	const query = workspaceTrpc.git.readDiffSideFile.useQuery(
		{ ...createGetDiffInput(workspaceId, file), path, side },
		{ retry: false, staleTime: 30_000 },
	);
	const absolutePath = toAbsoluteWorkspacePath(worktreePath, path);
	const content = useMemo<ContentState>(() => {
		if (query.isError)
			return { kind: "error", error: new Error(query.error.message) };
		if (!query.data) return { kind: "loading" };
		if (query.data.kind === "missing") return { kind: "not-found" };
		if (query.data.exceededLimit || query.data.content === null) {
			return { kind: "too-large" };
		}
		// The revision keys on the payload, not the fetch time, so a refetch
		// that returns the same bytes never remounts the view, and one that
		// returns different bytes of the same length still does.
		return {
			kind: "bytes",
			value: decodeBase64(query.data.content),
			revision: `${side}:${hashString(query.data.content)}`,
		};
	}, [query.data, query.isError, query.error, side]);
	const document = useMemo(
		() => createSnapshotDocument({ workspaceId, absolutePath, content }),
		[workspaceId, absolutePath, content],
	);

	return (
		<SideBody
			document={document}
			view={view}
			filePath={path}
			workspaceId={workspaceId}
		/>
	);
}

function SideBody({
	document,
	view,
	filePath,
	workspaceId,
}: {
	document: SharedFileDocument;
	view: FileView;
	filePath: string;
	workspaceId: string;
}) {
	const { content } = document;
	if (content.kind === "loading") {
		return (
			<SideMessage>
				<LuLoader className="size-5 animate-spin" />
			</SideMessage>
		);
	}
	if (content.kind === "too-large") {
		return (
			<SideMessage>
				<Trans>File is too large to preview</Trans>
			</SideMessage>
		);
	}
	if (content.kind !== "bytes") {
		return (
			<SideMessage>
				<Trans>Unable to load diff</Trans>
			</SideMessage>
		);
	}
	const Renderer = view.Renderer;
	return (
		<Renderer
			document={document}
			filePath={filePath}
			workspaceId={workspaceId}
			paneId=""
			isActive={false}
			onChangeView={() => {}}
			onForceView={() => {}}
			embedded
		/>
	);
}

function SideMessage({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full items-center justify-center p-4 text-muted-foreground text-sm">
			{children}
		</div>
	);
}
