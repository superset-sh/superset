import { TELEPORT_STEPS, type TeleportStepId } from "./teleport";

/**
 * The order a teleport happens in, and the guarantee that holds it together.
 *
 * The driver is deliberately free of transport, React, and git: it takes an
 * object of operations and calls them in sequence. That is what makes the
 * ordering — the part that must never be wrong — testable without two
 * machines, a relay, or a repository.
 *
 * The guarantee: **the source is only stopped once the destination has the
 * work.** `stopSource` runs after `restore` and after the destination's tabs
 * exist. Any failure before that point leaves the source exactly as it was,
 * which is why every step up to it is safe to retry.
 */

export interface TeleportOperations {
	/**
	 * Ask each live agent to write a handoff note into the checkout, so the
	 * note is captured with everything else. Bounded by the caller: a stuck
	 * agent must not hold a teleport open forever.
	 */
	askAgentsForHandoff(): Promise<void>;
	/** Freeze the dirty state into commits and pack it. Source side. */
	capture(): Promise<{ ref: string; bundlePath: string }>;
	/**
	 * Make sure the destination has the repository and a worktree on the
	 * branch, and get the bundle over to it. Returns the new workspace.
	 */
	createWorktree(capture: { ref: string; bundlePath: string }): Promise<{
		workspaceId: string;
		/** Where the bundle landed on the destination. */
		bundlePath: string;
	}>;
	/** Put the work back into the destination checkout. */
	restore(input: {
		workspaceId: string;
		ref: string;
		bundlePath: string;
	}): Promise<void>;
	/** Run the project's setup scripts there. */
	runSetupScripts(input: { workspaceId: string }): Promise<void>;
	/** Recreate the tabs and panes, without starting what they run. */
	rebuildTabs(input: { workspaceId: string }): Promise<void>;
	/** Stop the source's programs and mark it teleported. */
	stopSource(input: { destinationWorkspaceId: string }): Promise<void>;
	/** Start the agents and processes on the destination. */
	startPrograms(input: { workspaceId: string }): Promise<void>;
}

export interface TeleportProgress {
	step: TeleportStepId;
	state: "running" | "done" | "failed";
	error?: string;
}

export interface TeleportResult {
	/** The workspace now holding the work, when the run completed. */
	destinationWorkspaceId: string | null;
	/** The step that failed, or null when every step succeeded. */
	failedAt: TeleportStepId | null;
	error: string | null;
}

/**
 * Run a teleport, reporting each step as it goes.
 *
 * Never throws: a failure is a result with `failedAt` set, because every
 * caller has to render the same thing either way and an exception would only
 * move that branch somewhere less visible.
 */
export async function runTeleport(
	operations: TeleportOperations,
	onProgress: (progress: TeleportProgress) => void,
): Promise<TeleportResult> {
	let captured: { ref: string; bundlePath: string } | null = null;
	let destination: { workspaceId: string; bundlePath: string } | null = null;

	for (const step of TELEPORT_STEPS) {
		onProgress({ step, state: "running" });
		try {
			switch (step) {
				case "handoff":
					await operations.askAgentsForHandoff();
					break;
				case "capture":
					captured = await operations.capture();
					break;
				case "createWorktree":
					destination = await operations.createWorktree(
						expect(captured, "capture"),
					);
					break;
				case "restore":
					await operations.restore({
						workspaceId: expect(destination, "createWorktree").workspaceId,
						ref: expect(captured, "capture").ref,
						bundlePath: expect(destination, "createWorktree").bundlePath,
					});
					break;
				case "setup":
					await operations.runSetupScripts({
						workspaceId: expect(destination, "createWorktree").workspaceId,
					});
					break;
				case "tabs":
					await operations.rebuildTabs({
						workspaceId: expect(destination, "createWorktree").workspaceId,
					});
					break;
				case "stopSource":
					// Everything above has succeeded, so the work exists on the
					// destination. Only now may the source give it up.
					await operations.stopSource({
						destinationWorkspaceId: expect(destination, "createWorktree")
							.workspaceId,
					});
					break;
				case "launch":
					await operations.startPrograms({
						workspaceId: expect(destination, "createWorktree").workspaceId,
					});
					break;
			}
		} catch (error) {
			const message = errorText(error);
			onProgress({ step, state: "failed", error: message });
			return {
				destinationWorkspaceId: destination?.workspaceId ?? null,
				failedAt: step,
				error: message,
			};
		}
		onProgress({ step, state: "done" });
	}

	return {
		destinationWorkspaceId: destination?.workspaceId ?? null,
		failedAt: null,
		error: null,
	};
}

/**
 * A later step needing an earlier step's result is a programming error, not
 * a user-facing failure — but it still has to surface as one rather than as
 * `undefined` propagating into a git command.
 */
function expect<T>(value: T | null, producedBy: TeleportStepId): T {
	if (value === null) {
		throw new Error(`Teleport reached a later step before ${producedBy} ran`);
	}
	return value;
}

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
