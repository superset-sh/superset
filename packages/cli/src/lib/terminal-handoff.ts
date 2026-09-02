import { CLIError } from "@superset/cli-framework";
import { rawErrorMessage } from "@superset/i18n/errors";
import { buildTerminalSessionHandoffPrompt } from "@superset/shared/terminal-session-handoff";
import type { HostServiceClient } from "./host-target";

/**
 * Build the prompt that seeds a new agent session with a terminal's recent
 * context. The host sanitizes and bounds the transcript, so this and the
 * desktop dialog hand over exactly the same text for a given terminal.
 */
export async function buildHandoffPromptFromTerminal(
	client: HostServiceClient,
	input: { workspaceId: string; terminalId: string; maxChars?: number },
): Promise<string> {
	// A failed query and an empty terminal are different mistakes: sending
	// someone to check the terminal id when the host was unreachable points
	// them at the one thing that was right.
	let transcript: string;
	try {
		const result = await client.terminal.transcript.query({
			workspaceId: input.workspaceId,
			terminalId: input.terminalId,
			...(input.maxChars === undefined ? {} : { maxChars: input.maxChars }),
		});
		transcript = result.text;
	} catch (error) {
		throw new CLIError(
			`Couldn't read terminal ${input.terminalId}`,
			rawErrorMessage(error),
		);
	}
	if (!transcript) {
		throw new CLIError(
			`Terminal ${input.terminalId} has no output to hand off yet`,
			"Give the session something to say, or pass --prompt instead",
		);
	}

	const sourceAgentLabel = await resolveSourceAgentLabel(client, input);
	return buildTerminalSessionHandoffPrompt({
		transcript,
		...(sourceAgentLabel ? { sourceAgentLabel } : {}),
		sourceTerminalId: input.terminalId,
	});
}

/**
 * Name the harness the context came from. A terminal with no agent binding
 * still hands off — the transcript is what matters — so this returns undefined
 * and the prompt just says "a previous terminal session".
 */
async function resolveSourceAgentLabel(
	client: HostServiceClient,
	input: { workspaceId: string; terminalId: string },
): Promise<string | undefined> {
	const bindings = await client.terminalAgents.listByWorkspace
		.query({ workspaceId: input.workspaceId })
		.catch(() => []);
	const binding = bindings.find(
		(candidate) => candidate.terminalId === input.terminalId,
	);
	if (!binding) return undefined;

	const sourceId = binding.definitionId ?? binding.agentId;
	const configs = await client.settings.agentConfigs.list
		.query()
		.catch(() => []);
	const config = configs.find(
		(candidate) => candidate.id === sourceId || candidate.presetId === sourceId,
	);
	return config?.label ?? binding.agentId;
}
