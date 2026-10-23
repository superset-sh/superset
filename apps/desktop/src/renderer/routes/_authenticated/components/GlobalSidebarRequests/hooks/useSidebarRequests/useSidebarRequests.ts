import { errorMessage } from "@superset/i18n/errors";
import type {
	SidebarFolder,
	SidebarFolderPruneRequest,
	SidebarFolderPruneResult,
} from "@superset/shared/sidebar-folders";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	type EmptySidebarFolder,
	useEmptySidebarFolders,
} from "renderer/routes/_authenticated/hooks/useEmptySidebarFolders";

type SidebarReply = Parameters<
	typeof electronTrpcClient.sidebar.respond.mutate
>[0];

function toSidebarFolder({
	projectId,
	projectName,
	tag,
	name,
}: EmptySidebarFolder): SidebarFolder {
	return { projectId, projectName, tag, name };
}

/** Serves sidebar requests sent by the CLI for this window's organization. */
export function useSidebarRequests() {
	const organizationId = useActiveOrganizationId();
	const { removeEmptyFolders } = useEmptySidebarFolders();
	const latestRef = useRef({ organizationId, removeEmptyFolders });
	useLayoutEffect(() => {
		latestRef.current = { organizationId, removeEmptyFolders };
	});

	useEffect(() => {
		const serve = async (
			requestId: string,
			request: SidebarFolderPruneRequest,
		): Promise<SidebarReply> => {
			const latest = latestRef.current;
			// Main picks by the registry's org; this window may have switched since.
			if (latest.organizationId !== request.organizationId) {
				return {
					requestId,
					error: {
						code: "PRECONDITION_FAILED",
						message:
							"The desktop window switched organization before it could apply the change. Try again.",
					},
				};
			}
			const dryRun = request.dryRun ?? false;
			const { removed, skipped, failed } = await latest.removeEmptyFolders({
				projectId: request.projectId,
				dryRun,
			});
			const result: SidebarFolderPruneResult = {
				dryRun,
				removed: removed.map(toSidebarFolder),
				skipped: skipped.map((folder) => ({
					...toSidebarFolder(folder),
					reason: folder.reason,
				})),
				failed: failed.map((folder) => ({
					...toSidebarFolder(folder),
					error: folder.error,
				})),
			};
			return { requestId, result };
		};

		const subscription = electronTrpcClient.sidebar.onRequest.subscribe(
			undefined,
			{
				onData: ({ requestId, request }) => {
					void serve(requestId, request)
						.catch(
							(error: unknown): SidebarReply => ({
								requestId,
								error: { message: errorMessage(error) },
							}),
						)
						.then((reply) => electronTrpcClient.sidebar.respond.mutate(reply))
						.catch((error: unknown) => {
							console.error("[useSidebarRequests] reply failed:", error);
						});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, []);
}
