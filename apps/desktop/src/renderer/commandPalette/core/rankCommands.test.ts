import { describe, expect, test } from "bun:test";
import { msg } from "@lingui/core/macro";
import { initI18n } from "@superset/i18n";
import { rankCommands, rankSections, scoreCommand } from "./rankCommands";
import type { Command, CommandSection } from "./types";

// Command titles are message descriptors resolved through i18n at rank time.
initI18n();

function command(
	id: string,
	title: string,
	section: Command["section"],
	keywords?: string[],
): Command {
	return { id, title: { id: `test.${id}`, message: title }, section, keywords };
}

const DELETE_WORKSPACE = command(
	"workspace.delete:ws-1",
	"Delete workspace",
	"workspace",
	["archive", "remove", "close"],
);

// Mirrors the titles and keywords the real providers emit, in the order the
// palette renders them with a workspace open.
const SECTIONS: CommandSection[] = [
	{
		id: "workspace",
		label: msg({ message: "Workspace actions" }),
		commands: [
			command("workspace.new", "New workspace", "workspace"),
			command("workspace.quickCreate", "Quick create workspace", "workspace", [
				"new",
				"fast",
			]),
			command("files.quickOpen", "Search files", "workspace", [
				"file picker",
				"quick open",
			]),
			command("workspace.linkTask", "Link task", "workspace", [
				"issue",
				"linear",
			]),
			command("openIn.preferred:zed", "Open in Zed", "workspace", [
				"editor",
				"Zed",
			]),
			command("openIn.menu", "Open in…", "workspace", [
				"editor",
				"finder",
				"cursor",
				"vscode",
			]),
			command(
				"workspace.removeFromSidebar:ws-1",
				"Remove from sidebar",
				"workspace",
				["hide"],
			),
			DELETE_WORKSPACE,
		],
	},
	{
		id: "actions",
		label: msg({ message: "Actions" }),
		commands: [
			command("actions.toggleTheme", "Toggle theme", "actions", [
				"dark",
				"light",
				"appearance",
				"color",
			]),
			command(
				"actions.toggleNotificationSounds",
				"Mute notifications",
				"actions",
				["dnd", "silence", "notifications", "ringtone"],
			),
			command("actions.toggleLeftSidebar", "Toggle left sidebar", "actions"),
			command("actions.toggleRightSidebar", "Toggle right sidebar", "actions"),
			command("actions.showShortcuts", "Show keyboard shortcuts", "actions", [
				"hotkeys",
			]),
			command("actions.checkUpdates", "Check for updates", "actions", [
				"update",
				"upgrade",
			]),
			command("actions.newWindow", "New window", "actions", ["open", "multi"]),
			command("resources.check", "Check resources", "actions", [
				"resources",
				"memory",
				"cpu",
				"ram",
				"usage",
				"performance",
				"monitor",
				"activity",
				"processes",
			]),
			command("usage.open", "Usage", "actions", [
				"usage",
				"tokens",
				"spend",
				"cost",
				"quota",
				"plan",
				"billing",
				"claude",
				"codex",
				"model",
			]),
		],
	},
	{
		id: "navigation",
		label: msg({ message: "Navigation" }),
		commands: [
			command("nav.settings", "Settings", "navigation"),
			command("nav.recentlyViewed", "Recently Viewed", "navigation", [
				"history",
				"recent",
				"back",
			]),
			command("nav.workspaces", "Workspaces", "navigation", [
				"workspace",
				"project",
				"repo",
				"repository",
				"switch",
			]),
			command("nav.docs", "Open documentation", "navigation", ["docs", "help"]),
		],
	},
	{
		id: "add-project",
		label: msg({ message: "Add project" }),
		commands: [
			command("addProject.createNew", "Create new project", "add-project", [
				"add project",
				"new",
				"blank",
				"empty",
				"folder",
				"init",
			]),
			command("addProject.cloneFromUrl", "Clone from URL", "add-project", [
				"add project",
				"repository",
				"repo",
				"git",
				"clone",
			]),
		],
	},
];

function ids(sections: CommandSection[]): Record<string, string[]> {
	return Object.fromEntries(
		sections.map((section) => [
			section.id,
			section.commands.map((command) => command.id),
		]),
	);
}

function flatIds(sections: CommandSection[]): string[] {
	return sections.flatMap((section) =>
		section.commands.map((command) => command.id),
	);
}

describe("rankSections", () => {
	test("'them' surfaces Toggle theme, not the delete-workspace command", () => {
		const ranked = rankSections(SECTIONS, "them");
		expect(flatIds(ranked)[0]).toBe("actions.toggleTheme");
		expect(flatIds(ranked)).not.toContain(DELETE_WORKSPACE.id);
	});

	test("'po' matches nothing instead of every command with a p and an o", () => {
		expect(rankSections(SECTIONS, "po")).toEqual([]);
	});

	test("a section only ranks first when it holds the best hit", () => {
		const ranked = rankSections(SECTIONS, "open");
		expect(ranked.map((section) => section.id)).toEqual([
			"workspace",
			"navigation",
			"actions",
		]);
		expect(ids(ranked)).toEqual({
			workspace: ["openIn.preferred:zed", "openIn.menu", "files.quickOpen"],
			navigation: ["nav.docs"],
			actions: ["actions.newWindow"],
		});
	});

	test("empty or whitespace query keeps every section in provider order", () => {
		expect(rankSections(SECTIONS, "")).toBe(SECTIONS);
		expect(rankSections(SECTIONS, "   ")).toBe(SECTIONS);
	});

	test("query is case- and whitespace-insensitive", () => {
		expect(flatIds(rankSections(SECTIONS, "  THEME "))).toEqual([
			"actions.toggleTheme",
		]);
	});
});

describe("rankCommands", () => {
	const all = SECTIONS.flatMap((section) => section.commands);
	const rank = (query: string) => rankCommands(all, query).map((c) => c.id);

	test("title matches outrank keyword matches", () => {
		expect(rank("usage")).toEqual(["usage.open", "resources.check"]);
		expect(rank("new")).toEqual([
			"workspace.new",
			"actions.newWindow",
			"addProject.createNew",
			"workspace.quickCreate",
		]);
	});

	test("keywords match as whole-word prefixes", () => {
		expect(rank("dark")).toEqual(["actions.toggleTheme"]);
		expect(rank("hide")).toEqual(["workspace.removeFromSidebar:ws-1"]);
		expect(rank("archive")).toEqual([DELETE_WORKSPACE.id]);
		expect(rank("delete")).toEqual([DELETE_WORKSPACE.id]);
		expect(rank("vscode")).toEqual(["openIn.menu"]);
		expect(rank("docs")).toEqual(["nav.docs"]);
	});

	test("keywords do not match mid-word", () => {
		// "repo" and "repository" contain "po"; "appearance" contains "pea".
		expect(rank("po")).toEqual([]);
		expect(rank("pea")).toEqual([]);
	});

	test("title substrings match below word prefixes", () => {
		expect(rank("space")).toEqual([
			"workspace.new",
			"workspace.quickCreate",
			DELETE_WORKSPACE.id,
			"nav.workspaces",
		]);
		expect(rank("work")).toEqual([
			"nav.workspaces",
			"workspace.new",
			"workspace.quickCreate",
			DELETE_WORKSPACE.id,
		]);
	});

	test("multi-word queries match each word at a word start", () => {
		expect(rank("open zed")).toEqual(["openIn.preferred:zed"]);
		expect(rank("check upd")).toEqual(["actions.checkUpdates"]);
		expect(rank("keyboard shortcuts")).toEqual(["actions.showShortcuts"]);
		expect(rank("zed open")).toEqual(["openIn.preferred:zed"]);
	});

	test("ties keep provider order", () => {
		expect(rank("toggle")).toEqual([
			"actions.toggleTheme",
			"actions.toggleLeftSidebar",
			"actions.toggleRightSidebar",
		]);
	});
});

describe("scoreCommand", () => {
	const toggleTheme = command("t", "Toggle theme", "actions", ["dark"]);

	test("tiers: exact > prefix > word prefix > substring > keyword", () => {
		const exact = scoreCommand(toggleTheme, "toggle theme");
		const prefix = scoreCommand(toggleTheme, "toggle");
		const wordPrefix = scoreCommand(toggleTheme, "theme");
		const substring = scoreCommand(toggleTheme, "ggle");
		const keyword = scoreCommand(toggleTheme, "dark");
		expect(exact).toBeGreaterThan(prefix);
		expect(prefix).toBeGreaterThan(wordPrefix);
		expect(wordPrefix).toBeGreaterThan(substring);
		expect(substring).toBeGreaterThan(keyword);
		expect(keyword).toBeGreaterThan(0);
	});

	test("character subsequences never match", () => {
		expect(scoreCommand(toggleTheme, "tt")).toBe(0);
		expect(scoreCommand(toggleTheme, "tgl")).toBe(0);
		expect(scoreCommand(DELETE_WORKSPACE, "them")).toBe(0);
	});
});
