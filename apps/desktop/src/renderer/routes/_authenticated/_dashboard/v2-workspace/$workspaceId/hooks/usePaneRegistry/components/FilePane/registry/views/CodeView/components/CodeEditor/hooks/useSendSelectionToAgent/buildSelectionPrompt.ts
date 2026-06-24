import { formatAgentPromptWithFileContext } from "renderer/hooks/host-service/useSendToTerminalAgent";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { boundSelectionSnippet } from "./boundSelectionSnippet";

/** Default verb so a no-instruction prompt isn't a dangling `In <path>:L…: `. */
export const DEFAULT_SELECTION_INSTRUCTION = "Here is the selected code:";

/** Compose a captured selection into the shared file-context prompt: bound the
 *  snippet, embed it as a fenced block, and anchor it with `In <path>:L<a>-L<b>`
 *  (the anchor reflects the full range even when the snippet is truncated). */
export function buildSelectionPrompt(
	region: CapturedEditorSelection,
	instruction: string | undefined,
): string {
	const snippet = boundSelectionSnippet(region.text);
	const verb = instruction?.trim() || DEFAULT_SELECTION_INSTRUCTION;
	const comment = `${verb}\n\n\`\`\`\n${snippet}\n\`\`\``;

	return formatAgentPromptWithFileContext({
		comment,
		file: {
			path: region.path,
			startLine: region.startLine,
			endLine: region.endLine,
		},
	});
}
