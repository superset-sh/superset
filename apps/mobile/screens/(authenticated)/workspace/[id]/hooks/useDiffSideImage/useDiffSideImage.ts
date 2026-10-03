import { getFileExtension } from "@superset/shared/media-files";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { ChangesetSource } from "../useWorkspaceChangeset";

export type DiffSide = "old" | "new";

export type DiffSideImage =
	| { kind: "loading" }
	| { kind: "ready"; uri: string }
	| { kind: "too-large" }
	| { kind: "error" };

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const LOADING: DiffSideImage = { kind: "loading" };
const ERROR: DiffSideImage = { kind: "error" };

export function getDiffSideImageQueryKey(workspaceId: string | null) {
	return ["workspace-diff-side-image", workspaceId] as const;
}

/**
 * The host's `git.readDiffSideFile` rejects the unstaged new side: that side
 * is the working tree, so it is read through the filesystem.
 */
export function useDiffSideImage(args: {
	hostUrl: string | null;
	workspaceId: string | null;
	worktreePath: string | null;
	category: ChangesetSource;
	path: string;
	side: DiffSide;
	enabled?: boolean;
}): DiffSideImage {
	const {
		hostUrl,
		workspaceId,
		worktreePath,
		category,
		path,
		side,
		enabled = true,
	} = args;
	const query = useQuery({
		queryKey: [
			...getDiffSideImageQueryKey(workspaceId),
			category,
			side,
			path,
		] as const,
		enabled:
			enabled &&
			hostUrl !== null &&
			workspaceId !== null &&
			worktreePath !== null,
		staleTime: Number.POSITIVE_INFINITY,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async (): Promise<DiffSideImage> => {
			if (!hostUrl || !workspaceId || !worktreePath) {
				throw new Error("Host is not resolved");
			}
			const client = getHostServiceClientByUrl(hostUrl);
			const file =
				category === "unstaged" && side === "new"
					? await client.filesystem.readFile.query({
							workspaceId,
							absolutePath: `${worktreePath}/${path}`,
							maxBytes: MAX_PREVIEW_BYTES,
						})
					: await client.git.readDiffSideFile.query({
							workspaceId,
							path,
							category,
							side,
							maxBytes: MAX_PREVIEW_BYTES,
						});
			if (file.kind !== "bytes") return ERROR;
			if (file.exceededLimit || file.content === null) {
				return { kind: "too-large" };
			}
			return {
				kind: "ready",
				uri: `data:image/${getFileExtension(path)};base64,${file.content}`,
			};
		},
	});
	if (query.data) return query.data;
	return query.isError ? ERROR : LOADING;
}
