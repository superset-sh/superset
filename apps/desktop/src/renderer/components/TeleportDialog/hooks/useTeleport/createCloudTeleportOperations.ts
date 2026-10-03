import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { ARRIVAL_MARKER, buildArrivalCommand } from "@superset/shared/teleport";
import type { TeleportOperations } from "@superset/shared/teleport-driver";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { collectHandoffContext, sleep } from "./handoff-context";
import { isSandboxCheckoutReady } from "./sandbox-checkout";

/**
 * Teleport into a new cloud sandbox.
 *
 * A sandbox differs from a host someone owns in two ways that shape every
 * step here. Its workspace is created by the cloud API, not host
 * `workspaces.create` (which a sandbox refuses: one project, one workspace
 * per box). And it boots the *released* host-service, so nothing newer than
 * git can be assumed on arrival. The capture therefore travels as a ref on
 * origin — the sandbox clones origin anyway — and the restore is a terminal
 * command made of four git invocations, watched until it prints its marker.
 */

/** Provisioning a sandbox clones the repository; generous on purpose. */
const SANDBOX_READY_TIMEOUT_MS = 12 * 60_000;
const CHECKOUT_READY_TIMEOUT_MS = 5 * 60_000;
const RESTORE_TIMEOUT_MS = 5 * 60_000;

export interface CreateCloudTeleportOperationsInput {
	source: HostServiceClient;
	sourceWorkspaceId: string;
	organizationId: string;
	branch: string;
	/** The source's name; the sandbox is named after it. */
	workspaceName: string;
	sourceTerminalIds: string[];
	agentByTerminalId: Record<string, string>;
	/** The sandbox's cloud workspace id, as soon as the row exists. */
	onDestinationCreated: (cloudWorkspaceId: string) => void;
}

export function createCloudTeleportOperations({
	source,
	sourceWorkspaceId,
	organizationId,
	branch,
	workspaceName,
	sourceTerminalIds,
	agentByTerminalId,
	onDestinationCreated,
}: CreateCloudTeleportOperationsInput): TeleportOperations {
	let carried = new Map<string, string>();
	let publishedRef: string | null = null;
	let destination: HostServiceClient | null = null;

	return {
		askAgentsForHandoff: async () => {
			carried = await collectHandoffContext(
				source,
				sourceWorkspaceId,
				sourceTerminalIds,
			);
		},

		capture: async () => {
			const published = await source.teleport.publish.mutate({
				workspaceId: sourceWorkspaceId,
			});
			publishedRef = published.ref;
			return { ref: published.ref, bundlePath: "" };
		},

		createWorktree: async () => {
			const environments = await apiTrpcClient.environment.list.query({
				organizationId,
			});
			const environment = startableCloudEnvironments(environments)[0];
			if (!environment) {
				throw new Error(
					"Add an environment in Settings before teleporting to the cloud",
				);
			}
			const created = await apiTrpcClient.cloudWorkspace.create.mutate({
				organizationId,
				environmentId: environment.id,
				name: `${workspaceName} (teleported)`,
				branch,
			});
			onDestinationCreated(created.id);

			const access = await waitForSandbox(created.id);
			setHostServiceSecret(access.url, access.token);
			setHostServiceSecret(access.desktop.url, access.desktop.token);
			destination = getHostServiceClientByUrl(access.url);
			await waitForCheckout(destination);

			// The sandbox seeded exactly one workspace for its checkout; that
			// row is where the terminal runs and the files land.
			const [workspace] = await destination.workspace.list.query();
			if (!workspace) throw new Error("The sandbox has no workspace yet");
			return { workspaceId: workspace.id, bundlePath: "" };
		},

		restore: async ({ workspaceId }) => {
			if (!destination || !publishedRef) {
				throw new Error("Teleport reached restore before the sandbox existed");
			}
			const { terminalId } = await destination.terminal.launchSession.mutate({
				workspaceId,
				initialCommand: buildArrivalCommand(publishedRef, branch),
			});
			const deadline = Date.now() + RESTORE_TIMEOUT_MS;
			while (Date.now() < deadline) {
				const transcript = await destination.terminal.transcript
					.query({ workspaceId, terminalId })
					.catch(() => null);
				if (transcript?.text && ARRIVAL_MARKER.test(transcript.text)) return;
				await sleep(3_000);
			}
			throw new Error("The sandbox never reported the restore finishing");
		},

		runSetupScripts: async () => {
			// The sandbox's own start hook runs them on boot.
		},

		rebuildTabs: async () => {
			// Panes come back as their agents are launched below.
		},

		stopSource: async () => {
			await source.teleport.discard
				.mutate({ workspaceId: sourceWorkspaceId })
				.catch(() => {
					// A surviving local ref is litter, not a failure.
				});
		},

		startPrograms: async ({ workspaceId }) => {
			if (!destination || carried.size === 0) return;
			// A fresh box has no agent configs until a client lists them, which
			// is what seeds the bundled defaults that preset ids resolve against.
			await destination.settings.agentConfigs.list.query();
			for (const [terminalId, prompt] of carried) {
				const agent = agentByTerminalId[terminalId];
				if (!agent) continue;
				await destination.agents.run.mutate({ workspaceId, agent, prompt });
			}
		},
	};
}

/**
 * `cloudWorkspace.access` answers only once the sandbox is ready, and with
 * `wake` it also starts host-service inside it. Until then it throws, which
 * is the poll's "not yet".
 */
async function waitForSandbox(cloudWorkspaceId: string) {
	const deadline = Date.now() + SANDBOX_READY_TIMEOUT_MS;
	let lastError: unknown = null;
	while (Date.now() < deadline) {
		try {
			return await apiTrpcClient.cloudWorkspace.access.mutate({
				id: cloudWorkspaceId,
				wake: true,
			});
		} catch (error) {
			lastError = error;
			if (/failed|deleted/i.test(errorText(error))) break;
			await sleep(5_000);
		}
	}
	throw new Error(`The sandbox did not become ready: ${errorText(lastError)}`);
}

/**
 * A woken sandbox answers seconds after the wake, but its host-service is up
 * before its clone is done. Wait for the checkout, not just for health.
 */
async function waitForCheckout(host: HostServiceClient): Promise<void> {
	const deadline = Date.now() + CHECKOUT_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const health = await host.health.check.query().catch(() => null);
		if (health && isSandboxCheckoutReady(health)) return;
		await sleep(3_000);
	}
	throw new Error("The sandbox's checkout did not finish in time");
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
