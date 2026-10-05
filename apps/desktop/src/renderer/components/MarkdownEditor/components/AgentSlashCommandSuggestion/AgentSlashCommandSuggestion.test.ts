import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { SlashCommand } from "@superset/shared/slash-commands";
import type { AgentSlashCommandMenu } from "./AgentSlashCommandSuggestion";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: Document } = await import("@tiptap/extension-document");
const { default: Paragraph } = await import("@tiptap/extension-paragraph");
const { default: Text } = await import("@tiptap/extension-text");
const { AgentSlashCommandSuggestion, refreshAgentSlashCommands } = await import(
	"./AgentSlashCommandSuggestion"
);

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function command(name: string): SlashCommand {
	return {
		name,
		aliases: [],
		description: "",
		argumentHint: "",
		kind: "custom",
		source: "project",
		entryKind: "command",
		trigger: "/",
	};
}

function createEditor(initialCommands: SlashCommand[]) {
	let commands = initialCommands;
	let menu: AgentSlashCommandMenu | null = null;
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [
			Document,
			Paragraph,
			Text,
			AgentSlashCommandSuggestion.configure({
				getCommands: () => commands,
				onMenuChange: (next) => {
					menu = next;
				},
			}),
		],
	});
	return {
		editor,
		setCommands: (next: SlashCommand[]) => {
			commands = next;
		},
		menuNames: () => menu?.commands.map((c) => c.name) ?? null,
	};
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AgentSlashCommandSuggestion", () => {
	it("lists commands that arrive after the menu opened, filtered by the typed query", async () => {
		const { editor, setCommands, menuNames } = createEditor([]);
		editor.commands.insertContent("/cl");
		await settle();
		expect(menuNames()).toBeNull();

		setCommands([command("cloudflare"), command("deploy")]);
		refreshAgentSlashCommands(editor);
		await settle();
		expect(menuNames()).toEqual(["cloudflare"]);
		editor.destroy();
	});

	it("opens at the start of a line or after a space, never mid-word", async () => {
		const { editor, menuNames } = createEditor([command("cloudflare")]);
		editor.commands.insertContent("and/");
		await settle();
		expect(menuNames()).toBeNull();

		editor.commands.clearContent();
		editor.commands.insertContent("i want to use /");
		await settle();
		expect(menuNames()).toEqual(["cloudflare"]);

		editor.commands.clearContent();
		editor.commands.insertContent("/");
		await settle();
		expect(menuNames()).toEqual(["cloudflare"]);
		editor.destroy();
	});
});
