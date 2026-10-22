import { describe, expect, test } from "bun:test";
import { groupPlugins } from "./groupPlugins";

const plugin = (
	name: string,
	marketplace: string,
	category: "Productivity" | "Developer tools",
) => ({ name, marketplace, interface: { category } });

describe("groupPlugins", () => {
	test("organization plugins leave the categories for their own group", () => {
		const linear = plugin("linear", "superset", "Productivity");
		const internal = plugin("deploy", "organization-org1", "Developer tools");
		const sentry = plugin("sentry", "superset", "Developer tools");

		expect(groupPlugins([linear, internal, sentry])).toEqual({
			organization: [internal],
			categories: [
				{ category: "Productivity", plugins: [linear] },
				{ category: "Developer tools", plugins: [sentry] },
			],
		});
	});
});
