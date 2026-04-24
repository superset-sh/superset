import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { toast } from "@superset/ui/sonner";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type {
	PendingChatLaunch,
	PendingTerminalLaunch,
	PendingWorkspaceRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	buildForkAgentLaunch,
	type LoadedAttachment,
	type ResolvedPrContent,
} from "./buildForkAgentLaunch";

export interface DispatchForkLaunchInputs {
	workspaceId: string;
	pending: Pick<
		PendingWorkspaceRow,
		| "projectId"
		| "prompt"
		| "linkedIssues"
		| "linkedPR"
		| "hostTarget"
		| "agentId"
	>;
	loadedAttachments: LoadedAttachment[] | undefined;
	agentConfigs: ResolvedAgentConfig[];
	activeHostUrl: string | null;
	/**
	 * Pre-resolved PR content from the pr-checkout flow. Threaded into
	 * `buildForkAgentLaunch` so the `fetchPullRequest` resolver skips a
	 * redundant `getGitHubPullRequestContent` call.
	 */
	resolvedPr?: ResolvedPrContent;
	onApplyToRow: (patch: {
		terminalLaunch?: PendingTerminalLaunch | null;
		chatLaunch?: PendingChatLaunch | null;
	}) => void;
}

/**
 * After host-service.create resolves, run the composer pipeline and
 * stash the launch intent on the pending row. The V2 workspace page's
 * useConsumePendingLaunch mount effect picks it up.
 *
 * For terminal launches we also write attachment bytes to
 * `<worktree>/.superset/attachments/` now — the worktree exists and
 * workspaceTrpc.filesystem is available. Chat launches carry their
 * binaries as base64 data URLs inline (existing ChatLaunchConfig shape).
 */
export async function dispatchForkLaunch({
	workspaceId,
	pending,
	loadedAttachments,
	agentConfigs,
	activeHostUrl,
	resolvedPr,
	onApplyToRow,
}: DispatchForkLaunchInputs): Promise<void> {
	console.log("[v2-launch] dispatchForkLaunch: start", {
		workspaceId,
		projectId: pending.projectId,
		attachmentCount: loadedAttachments?.length ?? 0,
		agentConfigCount: agentConfigs.length,
	});

	const hostUrl = resolveHostUrl(pending.hostTarget, activeHostUrl);
	const hostClient = hostUrl ? getHostServiceClientByUrl(hostUrl) : undefined;

	let build: Awaited<ReturnType<typeof buildForkAgentLaunch>>;
	try {
		build = await buildForkAgentLaunch({
			pending,
			attachments: loadedAttachments,
			agentConfigs,
			hostServiceClient: hostClient,
			resolvedPr,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn("[v2-launch] buildForkAgentLaunch failed:", err);
		toast.error("Couldn't prepare agent launch", { description: msg });
		return;
	}

	console.log("[v2-launch] dispatchForkLaunch: built", {
		kind: build?.kind ?? null,
		terminalCommand:
			build?.kind === "terminal"
				? build.launch.command.slice(0, 120)
				: undefined,
		chatPrompt:
			build?.kind === "chat"
				? build.launch.initialPrompt?.slice(0, 120)
				: undefined,
		attachmentsToWrite:
			build?.kind === "terminal" ? build.attachmentsToWrite.length : 0,
	});

	if (!build) {
		console.warn(
			"[v2-launch] dispatchForkLaunch: buildForkAgentLaunch returned null — no launch",
		);
		// Only warn if the user gave input worth launching on (prompt text,
		// linked context, or attachments). An empty workspace-create with no
		// agent enabled is a valid case and shouldn't surface a toast.
		const userGaveInput =
			(pending.prompt?.trim().length ?? 0) > 0 ||
			pending.linkedIssues.length > 0 ||
			!!pending.linkedPR ||
			(loadedAttachments?.length ?? 0) > 0;
		if (userGaveInput) {
			toast.warning("Workspace created but no agent launched", {
				description:
					"Enable an agent in Settings → Agents to auto-launch on new workspaces.",
			});
		}
		return;
	}

	if (build.kind === "chat") {
		onApplyToRow({ chatLaunch: build.launch });
		console.log("[v2-launch] dispatchForkLaunch: chatLaunch applied to row");
		return;
	}

	if (!hostUrl) {
		console.warn("[v2-launch] host-service URL not resolved; skip launch");
		toast.error("Couldn't reach host service", {
			description: "Agent didn't launch. Check your host connection.",
		});
		return;
	}

	try {
		if (build.attachmentsToWrite.length > 0) {
			await writeAttachmentsToWorktree({
				hostUrl,
				workspaceId,
				attachments: build.attachmentsToWrite,
			});
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn("[v2-launch] failed to write attachments:", err);
		toast.warning("Attachments didn't save to the workspace", {
			description: `Agent will launch without files. ${msg}`,
		});
		// keep going — terminal launch still useful even without files
	}

	onApplyToRow({ terminalLaunch: build.launch });
	console.log("[v2-launch] dispatchForkLaunch: terminalLaunch applied to row", {
		workspaceId,
	});
}

function resolveHostUrl(
	hostTarget: PendingWorkspaceRow["hostTarget"],
	activeHostUrl: string | null,
): string | null {
	if (hostTarget.kind === "local") return activeHostUrl;
	return `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;
}

async function writeAttachmentsToWorktree({
	hostUrl,
	workspaceId,
	attachments,
}: {
	hostUrl: string;
	workspaceId: string;
	attachments: Array<{
		filename: string;
		mediaType: string;
		data: Uint8Array;
	}>;
}): Promise<void> {
	const client = getHostServiceClientByUrl(hostUrl);
	const workspace = await client.workspace.get.query({ id: workspaceId });
	const worktreePath: string | undefined = (
		workspace as { worktreePath?: string }
	).worktreePath;
	if (!worktreePath) {
		console.warn(
			"[v2-launch] workspace has no worktreePath; skipping attachments",
		);
		throw new Error("Workspace has no worktreePath");
	}

	const dir = joinPath(worktreePath, ".superset/attachments");
	try {
		await client.filesystem.createDirectory.mutate({
			workspaceId,
			absolutePath: dir,
		});
	} catch {
		// directory may already exist; writeFile will fail loudly if it doesn't
	}

	for (const attachment of attachments) {
		await client.filesystem.writeFile.mutate({
			workspaceId,
			absolutePath: joinPath(dir, attachment.filename),
			content: {
				kind: "base64",
				data: bytesToBase64(attachment.data),
			},
		});
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] ?? 0);
	}
	return btoa(binary);
}

function joinPath(a: string, b: string): string {
	if (a.endsWith("/")) return `${a}${b}`;
	return `${a}/${b}`;
}
