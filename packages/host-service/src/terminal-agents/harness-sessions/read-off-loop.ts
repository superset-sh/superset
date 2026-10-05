import { getHostWorkerPool } from "../../workers/host-worker-pool";
import { harnessTranscriptTask } from "../../workers/tasks/harness";
import type { HarnessTranscript } from "./transcript";
import type { HarnessSessionRef } from "./types";

/**
 * `readHarnessTranscript` on a host worker. A failure answers null so the
 * handoff falls back to the terminal stream rather than failing the dialog.
 */
export async function readHarnessTranscriptOffLoop(
	ref: HarnessSessionRef,
	maxChars: number,
): Promise<HarnessTranscript | null> {
	try {
		return await getHostWorkerPool().run(harnessTranscriptTask, {
			ref,
			maxChars,
		});
	} catch (error) {
		console.warn(
			`[harness-sessions] reading ${ref.agentId} session ${ref.sessionId} failed:`,
			error,
		);
		return null;
	}
}
