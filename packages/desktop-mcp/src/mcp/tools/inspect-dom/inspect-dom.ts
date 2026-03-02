import { z } from "zod";
import { DOM_INSPECTOR_SCRIPT } from "../../dom-inspector/index.js";
import type { ToolContext } from "../index.js";

interface DomElement {
	tag: string;
	selector: string;
	text?: string;
	interactive?: boolean;
	disabled?: boolean;
	focused?: boolean;
	role?: string;
	testId?: string;
	bounds: { x: number; y: number; width: number; height: number };
}

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"inspect_dom",
		{
			description:
				"Inspect the DOM of the Electron app. Returns a structured list of visible elements with selectors, text content, bounds, and interactivity info. Use this to understand what's on screen before clicking or typing. If you don't have an up-to-date view of the UI, call this first instead of guessing.",
			inputSchema: {
				selector: z
					.string()
					.optional()
					.describe("CSS selector to scope inspection to a subtree"),
				interactiveOnly: z
					.boolean()
					.default(false)
					.describe(
						"If true, only return interactive elements (buttons, inputs, links, etc.)",
					),
			},
		},
		async (args) => {
			const page = await getPage();
			const elements = (await page.evaluate(
				`(${DOM_INSPECTOR_SCRIPT})(${JSON.stringify({ selector: args.selector, interactiveOnly: args.interactiveOnly })})`,
			)) as DomElement[];

			const lines = elements.map((el) => {
				const attrs = [
					el.interactive ? "interactive" : "",
					el.disabled ? "disabled" : "",
					el.focused ? "focused" : "",
					el.role ? `role=${el.role}` : "",
					el.testId ? `testid=${el.testId}` : "",
				]
					.filter(Boolean)
					.join(", ");

				return `[${el.tag}] ${el.selector}${el.text ? ` — "${el.text.slice(0, 80)}"` : ""}${attrs ? ` (${attrs})` : ""} @ ${el.bounds.x},${el.bounds.y} ${el.bounds.width}x${el.bounds.height}`;
			});

			return {
				content: [
					{
						type: "text" as const,
						text: lines.length > 0 ? lines.join("\n") : "No elements found",
					},
				],
			};
		},
	);
}
