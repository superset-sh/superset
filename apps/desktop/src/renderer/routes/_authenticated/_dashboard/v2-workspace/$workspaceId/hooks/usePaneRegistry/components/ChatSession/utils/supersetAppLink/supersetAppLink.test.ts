import { describe, expect, test } from "bun:test";
import { parseSupersetAppLink } from "./supersetAppLink";

const WEB = "https://app.superset.sh";

describe("parseSupersetAppLink", () => {
	test.each([
		["https://app.superset.sh/page/my-page", { kind: "page", slug: "my-page" }],
		[
			"https://app.superset.sh/tasks/SUP-12/",
			{ kind: "task", taskId: "SUP-12" },
		],
		[
			"https://app.superset.sh/automations/a1",
			{ kind: "automation", automationId: "a1" },
		],
		[
			"https://app.superset.sh/plugins/linear",
			{ kind: "plugin", pluginName: "linear" },
		],
		[
			"https://app.superset.sh/workspaces/w1?tab=chat",
			{ kind: "workspace", workspaceId: "w1" },
		],
	])("%s", (href, expected) => {
		expect(parseSupersetAppLink(href, WEB)).toEqual(expected as never);
	});

	test("ignores other origins and unknown paths", () => {
		expect(parseSupersetAppLink("https://evil.sh/tasks/SUP-12", WEB)).toBe(
			null,
		);
		expect(parseSupersetAppLink("https://app.superset.sh/settings", WEB)).toBe(
			null,
		);
		expect(parseSupersetAppLink("https://app.superset.sh/tasks/a/b", WEB)).toBe(
			null,
		);
	});
});
