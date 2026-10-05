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
 *
 * The box is the slow part, so it is started first and boots while the
 * source is still being asked for its handoff notes and captured.
 */

/** Provisioning a sandbox may pull an image; generous on purpose. */
const SANDBOX_READY_TIMEOUT_MS = 12 * 60_000;
const CHECKOUT_READY_TIMEOUT_MS = 5 * 60_000;
const RESTORE_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 1_000;

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

interface ReadySandbox {
	client: HostServiceClient;
	workspaceId: string;
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
	let publishedTree: string | null = null;
	let destination: HostServiceClient | null = null;
	let sandbox: Promise<ReadySandbox> | null = null;
	let agentConfigsSeeded: Promise<unknown> | null = null;

	const collectHandoff = () =>
		collectHandoffContext(source, sourceWorkspaceId, sourceTerminalIds);

	/** Fetch the published ref into the box and put the work back, watched to its marker. */
	const arrive = async (
		host: HostServiceClient,
		workspaceId: string,
		ref: string,
	): Promise<void> => {
		const { terminalId } = await host.terminal.launchSession.mutate({
			workspaceId,
			initialCommand: buildArrivalCommand(ref, branch),
		});
		const deadline = Date.now() + RESTORE_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const transcript = await host.terminal.transcript
				.query({ workspaceId, terminalId })
				.catch(() => null);
			if (transcript?.text && ARRIVAL_MARKER.test(transcript.text)) return;
			await sleep(POLL_MS);
		}
		throw new Error("The sandbox never reported the restore finishing");
	};

	const startSandbox = (): Promise<ReadySandbox> => {
		if (!sandbox) {
			sandbox = provisionSandbox({
				organizationId,
				workspaceName,
				onDestinationCreated,
			});
			// Surfaced by the step that awaits it, never as an unhandled rejection.
			sandbox.catch(() => {});
		}
		return sandbox;
	};

	return {
		askAgentsForHandoff: async () => {
			void startSandbox();
			carried = await collectHandoff();
		},

		capture: async () => {
			const published = await source.teleport.publish.mutate({
				workspaceId: sourceWorkspaceId,
			});
			publishedRef = published.ref;
			publishedTree = published.workingTree;
			return { ref: published.ref, bundlePath: "" };
		},

		createWorktree: async () => {
			const ready = await startSandbox();
			destination = ready.client;
			// A fresh box has no agent configs until a client lists them, which
			// is what seeds the bundled defaults that preset ids resolve against.
			agentConfigsSeeded = ready.client.settings.agentConfigs.list
				.query()
				.catch(() => undefined);
			return { workspaceId: ready.workspaceId, bundlePath: "" };
		},

		restore: async ({ workspaceId }) => {
			if (!destination || !publishedRef) {
				throw new Error("Teleport reached restore before the sandbox existed");
			}
			await arrive(destination, workspaceId, publishedRef);
		},

		runSetupScripts: async () => {
			// The sandbox's own start hook runs them on boot.
		},

		rebuildTabs: async () => {
			// Panes come back as their agents are launched below.
		},

		stopSource: async ({ destinationWorkspaceId }) => {
			// The source stayed usable while the box came up. Whatever changed
			// since the first capture goes over now, as a second capture that
			// pushes nothing when the tree is the same.
			if (destination && publishedTree) {
				const latest = await source.teleport.publish.mutate({
					workspaceId: sourceWorkspaceId,
					unlessWorkingTree: publishedTree,
				});
				if (!latest.unchanged) {
					await arrive(destination, destinationWorkspaceId, latest.ref);
				}
			}
			await source.teleport.discard
				.mutate({ workspaceId: sourceWorkspaceId })
				.catch(() => {
					// A surviving local ref is litter, not a failure.
				});
		},

		startPrograms: async ({ workspaceId }) => {
			if (!destination) return;
			const host = destination;
			// Agents kept talking while the move ran; hand over where they are now.
			const latest = await collectHandoff();
			for (const [terminalId, text] of latest) carried.set(terminalId, text);
			if (carried.size === 0) return;
			await agentConfigsSeeded;
			await Promise.all(
				[...carried].flatMap(([terminalId, prompt]) => {
					const agent = agentByTerminalId[terminalId];
					if (!agent) return [];
					return [host.agents.run.mutate({ workspaceId, agent, prompt })];
				}),
			);
		},
	};
}

/**
 * A box that is ready to be restored into: created, awake, and past its
 * clone. No branch is requested from the cloud API: the box then fetches
 * the repository's default branch over its image's clone, the fast path,
 * and the arrival command moves the checkout onto the source branch. Asking
 * for the source branch, which rarely exists on origin, made the fetch fail
 * and the box clone from scratch.
 */
async function provisionSandbox({
	organizationId,
	workspaceName,
	onDestinationCreated,
}: Pick<
	CreateCloudTeleportOperationsInput,
	"organizationId" | "workspaceName" | "onDestinationCreated"
>): Promise<ReadySandbox> {
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
	});
	onDestinationCreated(created.id);

	const access = await waitForSandbox(created.id);
	setHostServiceSecret(access.url, access.token);
	setHostServiceSecret(access.desktop.url, access.desktop.token);
	const client = getHostServiceClientByUrl(access.url);
	await waitForCheckout(client);

	// The sandbox seeded exactly one workspace for its checkout; that row is
	// where the terminal runs and the files land.
	const [workspace] = await client.workspace.list.query();
	if (!workspace) throw new Error("The sandbox has no workspace yet");
	return { client, workspaceId: workspace.id };
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
			await sleep(POLL_MS);
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
		await sleep(POLL_MS);
	}
	throw new Error("The sandbox's checkout did not finish in time");
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
