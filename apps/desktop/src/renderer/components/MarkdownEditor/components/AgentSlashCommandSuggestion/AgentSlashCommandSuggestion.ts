import {
	getCommandMatchRank,
	type SlashCommand,
	sortSlashCommandMatches,
} from "@superset/shared/slash-commands";
import { type Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, {
	exitSuggestion,
	type SuggestionProps,
} from "@tiptap/suggestion";

const agentSlashCommandSuggestionKey = new PluginKey(
	"markdownEditorAgentSlashCommand",
);

const EXTENSION_NAME = "agentSlashCommandSuggestion";

export interface AgentSlashCommandMenu {
	commands: SlashCommand[];
	selectedIndex: number;
	select: (command: SlashCommand) => void;
	hover: (index: number) => void;
	dismiss: () => void;
}

export interface AgentSlashCommandSuggestionOptions {
	getCommands: () => SlashCommand[];
	onMenuChange: (menu: AgentSlashCommandMenu | null) => void;
}

interface AgentSlashCommandSuggestionStorage {
	open: boolean;
	refresh: () => void;
}

function getStorage(editor: Editor | null) {
	return (editor?.storage as Record<string, unknown> | undefined)?.[
		EXTENSION_NAME
	] as AgentSlashCommandSuggestionStorage | undefined;
}

export function isAgentSlashCommandMenuOpen(editor: Editor | null): boolean {
	return getStorage(editor)?.open === true;
}

export function refreshAgentSlashCommands(editor: Editor | null): void {
	getStorage(editor)?.refresh();
}

function matchCommands(commands: SlashCommand[], query: string) {
	const q = query.toLowerCase();
	return sortSlashCommandMatches(
		commands.flatMap((command) => {
			const rank = getCommandMatchRank(command, q);
			return rank === null ? [] : [{ command, rank }];
		}),
	);
}

export const AgentSlashCommandSuggestion = Extension.create<
	AgentSlashCommandSuggestionOptions,
	AgentSlashCommandSuggestionStorage
>({
	name: EXTENSION_NAME,

	addOptions() {
		return { getCommands: () => [], onMenuChange: () => {} };
	},

	addStorage() {
		return { open: false, refresh: () => {} };
	},

	addProseMirrorPlugins() {
		const { storage, options } = this;
		return [
			Suggestion<SlashCommand>({
				pluginKey: agentSlashCommandSuggestionKey,
				editor: this.editor,
				char: "/",
				allowSpaces: false,
				allow: ({ state, range }) => {
					const $pos = state.doc.resolve(range.from);
					if ($pos.parentOffset === 0) return true;
					return /\s/.test(
						$pos.parent.textBetween($pos.parentOffset - 1, $pos.parentOffset),
					);
				},
				command: ({ editor, range, props }) => {
					editor
						.chain()
						.focus()
						.insertContentAt(range, { type: "text", text: `/${props.name} ` })
						.run();
				},
				render: () => {
					let commands: SlashCommand[] = [];
					let selectedIndex = 0;
					let select: (command: SlashCommand) => void = () => {};
					let editor: Editor | null = null;

					const dismiss = () => {
						if (editor)
							exitSuggestion(editor.view, agentSlashCommandSuggestionKey);
					};
					const publish = () => {
						storage.open = commands.length > 0;
						options.onMenuChange(
							storage.open
								? {
										commands,
										selectedIndex,
										select,
										hover: (index) => {
											selectedIndex = index;
											publish();
										},
										dismiss,
									}
								: null,
						);
					};
					const show = (props: SuggestionProps<SlashCommand>) => {
						commands = matchCommands(options.getCommands(), props.query);
						selectedIndex = 0;
						select = (command) => props.command(command);
						storage.refresh = () => show(props);
						publish();
					};

					return {
						onStart: (props) => {
							editor = props.editor;
							editor.on("blur", dismiss);
							show(props);
						},
						onUpdate: show,
						onKeyDown: ({ event }) => {
							if (commands.length === 0 || event.isComposing) return false;
							if (event.key === "ArrowUp" || event.key === "ArrowDown") {
								const step = event.key === "ArrowUp" ? -1 : 1;
								selectedIndex =
									(selectedIndex + step + commands.length) % commands.length;
								publish();
								return true;
							}
							if (
								(event.key === "Enter" && !event.shiftKey) ||
								event.key === "Tab"
							) {
								const command = commands[selectedIndex];
								if (command) select(command);
								return true;
							}
							return false;
						},
						onExit: () => {
							editor?.off("blur", dismiss);
							storage.refresh = () => {};
							commands = [];
							publish();
						},
					};
				},
			}),
		];
	},
});
