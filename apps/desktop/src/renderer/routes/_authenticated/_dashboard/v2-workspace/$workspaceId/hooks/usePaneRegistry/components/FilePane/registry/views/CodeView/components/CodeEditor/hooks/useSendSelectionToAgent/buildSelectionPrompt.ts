import { formatAgentPromptWithFileContext } from "renderer/hooks/host-service/useSendToTerminalAgent";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { boundSelectionSnippet } from "./boundSelectionSnippet";

/** Used when the user gives no instruction, so the prompt is never an
 *  empty-comment `In <path>:L<a>-L<b>: ` with a dangling colon. */
export const DEFAULT_SELECTION_INSTRUCTION = "Here is the selected code:";

export interface BuiltSelectionPrompt {
	text: string;
	truncated: boolean;
}

/** Compose a captured selection into the shared inline file-context prompt:
 *  bound the snippet (edge #2) BEFORE formatting, embed it as a fenced block
 *  alongside the `In <path>:L<a>-L<b>` anchor, and keep the anchor reflecting
 *  the FULL selected range even when the embedded snippet is truncated. */
export function buildSelectionPrompt(
	region: CapturedEditorSelection,
	instruction: string | undefined,
): BuiltSelectionPrompt {
	const bounded = boundSelectionSnippet(region.text);
	const verb = instruction?.trim() || DEFAULT_SELECTION_INSTRUCTION;
	const comment = `${verb}\n\n\`\`\`\n${bounded.text}\n\`\`\``;

	const text = formatAgentPromptWithFileContext({
		comment,
		file: {
			path: region.path,
			startLine: region.startLine,
			endLine: region.endLine,
		},
	});

	return { text, truncated: bounded.truncated };
}
