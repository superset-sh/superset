import { useLingui } from "@lingui/react/macro";
import type {
	AvailableCommand,
	SessionConfigOption,
	UserContent,
} from "@superset/chat/protocol";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
	PromptInputCommand,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo, useRef } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl, PluginIcon } from "renderer/components/PluginIcon";
import { pluginMentionText } from "renderer/components/PluginMention";
import { usePluginMentionOptions } from "renderer/hooks/usePluginMentionOptions";
import { ModelPicker } from "./components/ModelPicker";

const DRAFT_DEBOUNCE_MS = 300;

export type ComposerProps = {
	workspaceId: string;
	draftKey: string;
	availableCommands: AvailableCommand[];
	configOptions?: SessionConfigOption[];
	onSetConfigOption?: (configId: string, value: string) => unknown;
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
	configOptions,
	onSetConfigOption,
	disabled,
	draftKey,
	onCancelTurn,
	onSend,
	placeholder,
	workspaceId,
}: ComposerProps) {
	const { t } = useLingui();
	const trpcUtils = workspaceTrpc.useUtils();
	const uploadAttachment = workspaceTrpc.attachments.upload.useMutation();
	const pluginMentions = usePluginMentionOptions();
	const isDark = useIsDarkTheme();
	const pluginEntries = useMemo(
		() =>
			pluginMentions.map(
				(plugin): ComposerMentionEntry => ({
					id: `plugin:${plugin.name}`,
					label: plugin.displayName,
					description: plugin.description,
					icon: (
						<PluginIcon pluginName={plugin.name} className="size-4 rounded" />
					),
					keywords: [plugin.name, plugin.description],
					select: (ctx) =>
						ctx.insertChip({
							label: plugin.displayName,
							serialized: pluginMentionText(plugin.name),
							iconUrl: getPluginIconUrl(plugin.name, isDark),
						}),
				}),
			),
		[isDark, pluginMentions],
	);

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
				id: "plugins",
				title: t({ message: "Plugins" }),
				priority: 0,
				source: { kind: "static", load: () => pluginEntries },
			},
			{
				id: "files",
				title: t({ message: "Files" }),
				priority: 1,
				source: {
					kind: "search",
					search: searchFiles,
					emptyState: t({ message: "No matching files" }),
				},
			},
		],
		[pluginEntries, searchFiles, t],
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
		async ({ text, files }: { text: string; files: File[] }) => {
			if (disabled || (text.trim() === "" && files.length === 0)) return;
			let attachments: UserContent[];
			try {
				attachments = await Promise.all(
					files.map(async (file) => {
						const mimeType = file.type || "application/octet-stream";
						const { attachmentId } = await uploadAttachment.mutateAsync({
							data: { kind: "base64", data: await fileToBase64(file) },
							mediaType: mimeType,
							originalFilename: file.name,
						});
						return {
							type: "attachment" as const,
							attachmentId,
							name: file.name,
							mimeType,
						};
					}),
				);
			} catch (error) {
				toast.error(t({ message: "Couldn't attach files" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return;
			}
			onSend([
				...(text.trim() === "" ? [] : [{ type: "text" as const, text }]),
				...attachments,
			]);
			window.localStorage.removeItem(draftKey);
		},
		[disabled, onSend, draftKey, uploadAttachment, t],
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
				toolbarEnd={
					configOptions && onSetConfigOption ? (
						<ModelPicker
							configOptions={configOptions}
							onSelect={onSetConfigOption}
						/>
					) : null
				}
			/>
		</div>
	);
}

async function fileToBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}
