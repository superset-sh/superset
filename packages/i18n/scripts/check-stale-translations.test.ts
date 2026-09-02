import { describe, expect, it } from "bun:test";
import {
	type Catalogs,
	findStaleTranslations,
	fingerprint,
	parseExemptions,
	parsePo,
} from "./check-stale-translations";

function catalogs(
	source: Record<string, string>,
	translations: Record<string, Record<string, string>>,
): Catalogs {
	return {
		source: new Map(Object.entries(source)),
		translations: new Map(
			Object.entries(translations).map(([locale, messages]) => [
				locale,
				new Map(Object.entries(messages)),
			]),
		),
	};
}

const NO_EXEMPTIONS = new Map<string, string>();

describe("parsePo", () => {
	it("reads ids and translations, joining continuation lines", () => {
		const entries = parsePo(
			[
				'msgid ""',
				'msgstr "Project-Id-Version: superset\\n"',
				"",
				"#. js-lingui-explicit-id",
				'msgid "settings.security.title"',
				'msgstr "Remote Access"',
				"",
				'msgid "settings.security.subtitle"',
				'msgstr ""',
				'"Control how your local machine "',
				'"is reachable from elsewhere"',
				"",
			].join("\n"),
		);

		expect(entries.get("settings.security.title")).toBe("Remote Access");
		expect(entries.get("settings.security.subtitle")).toBe(
			"Control how your local machine is reachable from elsewhere",
		);
	});

	it("unescapes quotes and newlines", () => {
		const entries = parsePo(
			'msgid "a"\nmsgstr "turn on \\"Allow remote access\\"\\nthen retry"\n',
		);
		expect(entries.get("a")).toBe('turn on "Allow remote access"\nthen retry');
	});

	it("skips obsolete entries so a renamed id does not read as present", () => {
		const entries = parsePo(
			[
				'#~ msgid "settings.security.old"',
				'#~ msgstr "Remote Workspaces"',
				"",
				'msgid "settings.security.title"',
				'msgstr "Remote Access"',
				"",
			].join("\n"),
		);

		expect(entries.has("settings.security.old")).toBe(false);
		expect(entries.get("settings.security.title")).toBe("Remote Access");
	});
});

describe("findStaleTranslations", () => {
	const base = catalogs(
		{ title: "Remote Workspaces", unrelated: "Billing" },
		{
			ja: { title: "リモートワークスペース", unrelated: "請求" },
			"zh-CN": { title: "远程工作区", unrelated: "账单" },
		},
	);

	it("flags a translation left behind when the English text changed", () => {
		const current = catalogs(
			{ title: "Remote Access", unrelated: "Billing" },
			{
				ja: { title: "リモートワークスペース", unrelated: "請求" },
				"zh-CN": { title: "远程工作区", unrelated: "账单" },
			},
		);

		const stale = findStaleTranslations(base, current, NO_EXEMPTIONS);

		expect(stale).toHaveLength(1);
		expect(stale[0]).toMatchObject({
			id: "title",
			before: "Remote Workspaces",
			after: "Remote Access",
			locales: ["ja", "zh-CN"],
		});
	});

	it("reports only the locales that were left behind", () => {
		const current = catalogs(
			{ title: "Remote Access" },
			{
				ja: { title: "リモートアクセス" },
				"zh-CN": { title: "远程工作区" },
			},
		);

		expect(
			findStaleTranslations(base, current, NO_EXEMPTIONS)[0]?.locales,
		).toEqual(["zh-CN"]);
	});

	it("passes when every translation moved with the English", () => {
		const current = catalogs(
			{ title: "Remote Access" },
			{ ja: { title: "リモートアクセス" }, "zh-CN": { title: "远程访问" } },
		);

		expect(findStaleTranslations(base, current, NO_EXEMPTIONS)).toEqual([]);
	});

	it("ignores new messages, which compile --strict already covers", () => {
		const current = catalogs(
			{ title: "Remote Workspaces", added: "Brand new" },
			{
				ja: { title: "リモートワークスペース" },
				"zh-CN": { title: "远程工作区" },
			},
		);

		expect(findStaleTranslations(base, current, NO_EXEMPTIONS)).toEqual([]);
	});

	it("ignores a message translated at the base but absent from its source", () => {
		// Only reachable from a hand-edited catalog, but it must not be reported
		// as English "changing" from nothing.
		const orphaned = catalogs(
			{},
			{
				ja: { title: "リモートワークスペース" },
				"zh-CN": { title: "远程工作区" },
			},
		);
		const current = catalogs(
			{ title: "Remote Access" },
			{
				ja: { title: "リモートワークスペース" },
				"zh-CN": { title: "远程工作区" },
			},
		);

		expect(findStaleTranslations(orphaned, current, NO_EXEMPTIONS)).toEqual([]);
	});

	it("honours an exemption granted for that exact English text", () => {
		const current = catalogs(
			{ title: "Remote Access" },
			{
				ja: { title: "リモートワークスペース" },
				"zh-CN": { title: "远程工作区" },
			},
		);
		const exempt = new Map([["title", fingerprint("Remote Access")]]);

		expect(findStaleTranslations(base, current, exempt)).toEqual([]);
	});

	it("re-flags an exempted message when the English changes again", () => {
		const current = catalogs(
			{ title: "Remote entry" },
			{
				ja: { title: "リモートワークスペース" },
				"zh-CN": { title: "远程工作区" },
			},
		);
		const exempt = new Map([["title", fingerprint("Remote Access")]]);

		expect(findStaleTranslations(base, current, exempt)).toHaveLength(1);
	});
});

describe("parseExemptions", () => {
	it("reads id/fingerprint pairs and ignores comments and blank lines", () => {
		const exemptions = parseExemptions(
			[
				"# typo fix, translations still correct",
				"settings.security.title 7c2a55e9",
				"",
				"  settings.billing.row  a91f0c72  # trailing note",
			].join("\n"),
		);

		expect(exemptions.get("settings.security.title")).toBe("7c2a55e9");
		expect(exemptions.get("settings.billing.row")).toBe("a91f0c72");
		expect(exemptions.size).toBe(2);
	});
});
