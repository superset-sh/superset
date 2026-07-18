import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

/**
 * Chunking that reads as human typing to Codex's burst-paste detector:
 * 3-5 chars every ~25ms stays under the coalescing threshold (verified
 * empirically against Codex 0.144.5).
 */
const TYPE_CHUNK_SIZE = 4;
const TYPE_CHUNK_DELAY_MS = 25;

/**
 * Type a single-line command into the PTY as throttled keystrokes, then
 * submit it with a carriage return.
 *
 * Exists because Codex only executes slash commands that arrive as typed
 * input: a bracket-pasted "/model" is treated as a plain chat message and
 * burns a model turn (verified against Codex 0.144.5). Sending the whole
 * command in one raw write doesn't work either — Codex's burst-paste
 * detection coalesces rapid input and treats it as a paste — so the bytes
 * are drip-fed in small chunks with short delays. The CR is written last,
 * after the final chunk's delay, so it can't be folded into a detected
 * paste (where it would become newline content instead of a submit).
 */
export async function typeCommandIntoPty(
	terminalId: string,
	command: string,
	terminalInstanceId?: string,
): Promise<void> {
	for (let i = 0; i < command.length; i += TYPE_CHUNK_SIZE) {
		terminalRuntimeRegistry.writeInput(
			terminalId,
			command.slice(i, i + TYPE_CHUNK_SIZE),
			terminalInstanceId,
		);
		await new Promise((resolve) => setTimeout(resolve, TYPE_CHUNK_DELAY_MS));
	}
	terminalRuntimeRegistry.writeInput(terminalId, "\r", terminalInstanceId);
}
