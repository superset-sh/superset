import type { workspaceTrpc } from "@superset/workspace-client";
import type { DesignModePayload } from "shared/browser-design-mode";
import { formatDesignModeContextMarkdown } from "./designModePrompt";

/** Imperative host-service client (`workspaceTrpc.useUtils().client`). */
export type WorkspaceTrpcClient = ReturnType<
	typeof workspaceTrpc.useUtils
>["client"];

function joinAbsolutePath(parentAbsolutePath: string, name: string): string {
	const separator = parentAbsolutePath.includes("\\") ? "\\" : "/";
	return `${parentAbsolutePath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export interface DesignModeAttachmentPaths {
	/** Repo-relative path of the context markdown file. */
	contextPath: string;
	/** Repo-relative path of the element screenshot PNG, when captured. */
	screenshotPath: string | null;
}

/**
 * Stage the design-mode selection for the agent: the full element context as
 * markdown, plus the element screenshot when one was captured. Files land in
 * `.superset/attachments/` (the same drop zone agent launches use) so the
 * one-line terminal prompt can reference them by repo-relative path.
 *
 * Goes through the host-service filesystem router — v2 workspace ids live in
 * host.db, which the electron-side filesystem/workspaces routers don't know.
 */
export async function writeDesignModeAttachments({
	client,
	workspaceId,
	paneId,
	payload,
	comment,
}: {
	client: WorkspaceTrpcClient;
	workspaceId: string;
	/** Browser pane the element was picked in, for the live-verify hints. */
	paneId: string;
	payload: DesignModePayload;
	comment: string;
}): Promise<DesignModeAttachmentPaths> {
	const workspace = await client.workspace.get.query({ id: workspaceId });
	if (!workspace?.worktreePath) {
		throw new Error("Workspace path not found");
	}

	const attachmentsDirectory = joinAbsolutePath(
		workspace.worktreePath,
		".superset/attachments",
	);
	await client.filesystem.createDirectory.mutate({
		workspaceId,
		absolutePath: attachmentsDirectory,
		recursive: true,
	});

	// Timestamp alone can collide across rapid sends; suffix for uniqueness.
	const baseName = `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const contextName = `${baseName}.md`;
	await client.filesystem.writeFile.mutate({
		workspaceId,
		absolutePath: joinAbsolutePath(attachmentsDirectory, contextName),
		content: formatDesignModeContextMarkdown(payload, comment, {
			workspaceId,
			paneId,
		}),
	});

	let screenshotPath: string | null = null;
	const dataUrl = payload.screenshot?.dataUrl;
	if (dataUrl?.startsWith("data:image/png;base64,")) {
		const screenshotName = `${baseName}.png`;
		await client.filesystem.writeFile.mutate({
			workspaceId,
			absolutePath: joinAbsolutePath(attachmentsDirectory, screenshotName),
			content: {
				kind: "base64",
				data: dataUrl.slice("data:image/png;base64,".length),
			},
		});
		screenshotPath = `.superset/attachments/${screenshotName}`;
	}

	return {
		contextPath: `.superset/attachments/${contextName}`,
		screenshotPath,
	};
}
