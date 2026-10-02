import { useLingui } from "@lingui/react/macro";
import type { AvailableCommand, UserContent } from "@superset/chat/protocol";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useRef } from "react";

const DRAFT_DEBOUNCE_MS = 300;

export type ComposerProps = {
	workspaceId: string;
	draftKey: string;
	availableCommands: AvailableCommand[];
	onSend: (content: UserContent[]) => unknown;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
};

/**
 * The agent's own slash commands, in the shape the composer's menu takes.
 * Selecting one inserts a chip that serializes back to `/name`, so what the
 * agent receives is the command it advertised.
 */
function toMenuCommands(commands: AvailableCommand[]): PromptInputCommand[] {
	return commands.map((command) => ({
		id: command.name,
		title: `/${command.name}`,
		description: command.description ?? command.hint ?? "",
		onSelect: (ctx) =>
			ctx.insertChip({
				label: `/${command.name}`,
				serialized: `/${command.name}`,
			}),
	}));
}

export function Composer({
	availableCommands,
	disabled,
	draftKey,
	onCancelTurn,
	onSend,
	placeholder,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const trpcUtils = workspaceTrpc.useUtils();

	const searchFiles = useCallback(
		async (query: string) => {
			const { matches } = await trpcUtils.filesystem.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return matches.map(
				(match): ComposerMentionEntry => ({
					id: match.absolutePath,
					label: match.name,
					description: match.relativePath,
					// The agent reads the path itself, so a mention is the path.
					select: (ctx) =>
						ctx.insertChip({
							label: match.name,
							serialized: match.relativePath,
						}),
				}),
			);
		},
		[trpcUtils, workspaceId],
	);

	const mentionProviders = useMemo<ComposerMentionProvider[]>(
		() => [
			{
				id: "files",
				title: t({ message: "Files" }),
				priority: 0,
				source: {
					kind: "search",
					search: searchFiles,
					emptyState: t({ message: "No matching files" }),
				},
			},
		],
		[searchFiles, t],
	);

	const commands = useMemo(
		() => toMenuCommands(availableCommands),
		[availableCommands],
	);

	// Debounced so a draft costs one write per pause rather than one per
	// keystroke; the last value is flushed when the pane goes away.
	const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onChange = useCallback(
		(text: string) => {
			if (draftTimer.current) clearTimeout(draftTimer.current);
			draftTimer.current = setTimeout(() => {
				if (text === "") window.localStorage.removeItem(draftKey);
				else window.localStorage.setItem(draftKey, text);
			}, DRAFT_DEBOUNCE_MS);
		},
		[draftKey],
	);

	const handleSubmit = useCallback(
		({ text }: { text: string }) => {
			if (text.trim() === "" || disabled) return;
			onSend([{ type: "text", text }]);
			window.localStorage.removeItem(draftKey);
		},
		[disabled, onSend, draftKey],
	);

	return (
		<div className="px-6 pt-1 pb-5">
			<PromptInput
				className="mx-auto w-full max-w-3xl"
				commands={commands}
				defaultValue={window.localStorage.getItem(draftKey) ?? undefined}
				key={draftKey}
				mentionProviders={mentionProviders}
				onChange={onChange}
				onStop={onCancelTurn ?? undefined}
				onSubmit={handleSubmit}
				placeholder={
					placeholder ??
					t({ message: "Ask the agent, @mention files, run /commands" })
				}
				status={onCancelTurn ? "streaming" : "ready"}
			/>
		</div>
	);
}
