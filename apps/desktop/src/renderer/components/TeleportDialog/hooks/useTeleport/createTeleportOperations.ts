import type { TeleportOperations } from "@superset/shared/teleport-driver";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { collectHandoffContext } from "./handoff-context";

/**
 * Bind the driver to two real host-service clients.
 *
 * Every call below is a procedure that exists. The bundle crosses between
 * hosts through `filesystem.readFile` / `writeFile`: the renderer is already
 * connected to both, and a capture is small enough (the changed blobs, not
 * the history) that carrying it as base64 through the client is cheaper to
 * build and reason about than a new host-to-host transport. The
 * relay-direct fetch in the plan is an optimisation on top of this, not a
 * prerequisite for it.
 */

export interface CreateTeleportOperationsInput {
	source: HostServiceClient;
	destination: HostServiceClient;
	sourceWorkspaceId: string;
	/** Project on the destination host that owns the branch. */
	destinationProjectId: string;
	/** Repository path on the destination, when it already has one. */
	destinationRepositoryPath: string | null;
	branch: string;
	/** Creates the destination workspace; resolves to its id. */
	createDestinationWorkspace: (input: {
		projectId: string;
		branch: string;
	}) => Promise<string>;
	/** Terminals on the source whose context should travel. */
	sourceTerminalIds: string[];
	/** The agent each source terminal was running, for the relaunch. */
	agentByTerminalId: Record<string, string>;
	/** Relaunches an agent on the destination with the carried context. */
	launchAgent: (input: {
		workspaceId: string;
		agent: string;
		prompt: string;
	}) => Promise<unknown>;
}

export function createTeleportOperations({
	source,
	destination,
	sourceWorkspaceId,
	destinationProjectId,
	destinationRepositoryPath,
	branch,
	createDestinationWorkspace,
	sourceTerminalIds,
	agentByTerminalId,
	launchAgent,
}: CreateTeleportOperationsInput): TeleportOperations {
	/** Context carried per terminal, gathered before anything is captured. */
	let carried = new Map<string, string>();
	let bundleBase64: string | null = null;

	return {
		askAgentsForHandoff: async () => {
			carried = await collectHandoffContext(
				source,
				sourceWorkspaceId,
				sourceTerminalIds,
			);
		},

		capture: async () => {
			// What the destination already has turns the bundle from "all of
			// history" into "what is missing". A destination with no copy of
			// the repository offers nothing, and the bundle is complete.
			const tips = destinationRepositoryPath
				? (
						await destination.teleport.destinationState.query({
							repositoryPath: destinationRepositoryPath,
							branch,
						})
					).tips
				: [];

			const capture = await source.teleport.capture.mutate({
				workspaceId: sourceWorkspaceId,
				destinationTips: tips,
			});

			const file = await source.filesystem.readFile.query({
				workspaceId: sourceWorkspaceId,
				absolutePath: capture.bundlePath,
			});
			if (!("content" in file) || typeof file.content !== "string") {
				throw new Error("The teleport bundle could not be read");
			}
			bundleBase64 = file.content;

			return { ref: capture.ref, bundlePath: capture.bundlePath };
		},

		createWorktree: async () => {
			const workspaceId = await createDestinationWorkspace({
				projectId: destinationProjectId,
				branch,
			});
			const target = await destination.teleport.bundleTarget.query({
				workspaceId,
			});
			if (bundleBase64 === null) {
				throw new Error("Teleport had no bundle to deliver");
			}
			await destination.filesystem.writeFile.mutate({
				workspaceId,
				absolutePath: target.bundlePath,
				content: { kind: "base64", data: bundleBase64 },
				options: { create: true, overwrite: true },
			});
			return { workspaceId, bundlePath: target.bundlePath };
		},

		restore: async ({ workspaceId, ref, bundlePath }) => {
			await destination.teleport.restore.mutate({
				workspaceId,
				ref,
				bundlePath,
			});
		},

		runSetupScripts: async () => {
			// The destination's own create runs them; a second pass would
			// re-install on top of a checkout that is now dirty.
		},

		rebuildTabs: async () => {
			// Panes come back as their agents are launched below. A faithful
			// split-tree rebuild is the next increment.
		},

		stopSource: async () => {
			// The work is on the destination. Release the source's capture and
			// its bundle so the checkout is clean for whoever comes back to it.
			await source.teleport.discard
				.mutate({ workspaceId: sourceWorkspaceId })
				.catch(() => {
					// A surviving ref is litter, not a failure, and must never
					// fail a teleport whose work has already landed.
				});
		},

		startPrograms: async ({ workspaceId }) => {
			for (const [terminalId, prompt] of carried) {
				const agent = agentByTerminalId[terminalId];
				if (!agent) continue;
				await launchAgent({ workspaceId, agent, prompt });
			}
		},
	};
}
