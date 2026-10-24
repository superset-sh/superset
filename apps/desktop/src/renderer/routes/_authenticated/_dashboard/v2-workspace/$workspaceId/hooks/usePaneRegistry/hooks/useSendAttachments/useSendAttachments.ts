import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { sendAttachmentsToWorkspace } from "../../utils/sendAttachmentsToWorkspace";

async function putObject(
	target: { url: string; headers: Record<string, string> },
	file: File,
): Promise<Response> {
	return await fetch(target.url, {
		method: "PUT",
		headers: target.headers,
		body: file,
	});
}

/**
 * A stable function that gets files into the workspace's worktree and
 * returns their worktree-relative paths. Stable so a terminal's paste
 * override, registered once, always sees the current host target.
 */
export function useSendAttachments(
	workspaceId: string,
): (files: File[]) => Promise<string[]> {
	const target = useWorkspaceHostTarget(workspaceId);
	const isCloudWorkspace =
		target.status === "ready" && target.kind === "sandbox";
	const isCloudRef = useRef(isCloudWorkspace);
	isCloudRef.current = isCloudWorkspace;

	const materialize =
		workspaceTrpc.attachments.materializeIntoWorkspace.useMutation();
	const materializeRef = useRef(materialize.mutateAsync);
	materializeRef.current = materialize.mutateAsync;

	return useCallback(
		(files: File[]) =>
			sendAttachmentsToWorkspace({
				deps: {
					createUpload: (input) =>
						apiTrpcClient.attachment.createUpload.mutate(input),
					putObject,
					attachFiles: (input) =>
						apiTrpcClient.cloudWorkspace.attachFiles.mutate(input),
					materialize: (input) => materializeRef.current(input),
				},
				workspaceId,
				isCloudWorkspace: isCloudRef.current,
				files,
			}),
		[workspaceId],
	);
}
