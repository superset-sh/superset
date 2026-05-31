import { z } from "zod";
import type { ToolContext } from "../index.js";

/**
 * Script injected into the page to find an element and return its center coordinates.
 * The caller then uses page.mouse.click() via CDP for proper event dispatch.
 */
const FIND_ELEMENT_SCRIPT = `(opts) => {
	const { selector, text, testId, index, fuzzy } = opts;
	let el;

	if (selector) {
		el = document.querySelectorAll(selector)[index];
	} else if (testId) {
		el = document.querySelectorAll('[data-testid="' + testId + '"]')[index];
	} else if (text) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		const matches = [];
		let node;
		while (node = walker.nextNode()) {
			const content = node.textContent.trim();
			if (fuzzy
				? content.toLowerCase().includes(text.toLowerCase())
				: content === text) {
				matches.push(node.parentElement);
			}
		}
		el = matches[index];
	}

	if (!el) return null;

	el.scrollIntoView({ block: 'nearest' });
	const rect = el.getBoundingClientRect();
	return {
		tag: el.tagName.toLowerCase(),
		text: (el.textContent || '').trim().slice(0, 100),
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
	};
}`;

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"click",
		{
			description:
				"Click on a UI element in the Electron app. Provide at least one targeting method: CSS selector, visible text, data-testid, or x/y coordinates. Use inspect_dom first to find element selectors.",
			inputSchema: {
				selector: z
					.string()
					.optional()
					.describe("CSS selector of element to click"),
				text: z
					.string()
					.optional()
					.describe("Visible text content to find and click"),
				testId: z.string().optional().describe("data-testid attribute value"),
				x: z.number().optional().describe("X coordinate for click"),
				y: z.number().optional().describe("Y coordinate for click"),
				index: z
					.number()
					.int()
					.min(0)
					.default(0)
					.describe("0-based index if multiple elements match (default 0)"),
				fuzzy: z
					.boolean()
					.default(true)
					.describe("Use fuzzy/partial text matching (default true)"),
			},
		},
		async (args) => {
			const page = await getPage();

			// Click by coordinates
			if (args.x !== undefined && args.y !== undefined) {
				await page.mouse.click(args.x as number, args.y as number);
				return {
					content: [
						{
							type: "text" as const,
							text: `Clicked at (${args.x}, ${args.y})`,
						},
					],
				};
			}

			// Find element, get its center coordinates, then click via CDP mouse
			const opts = JSON.stringify({
				selector: (args.selector as string) ?? null,
				text: (args.text as string) ?? null,
				testId: (args.testId as string) ?? null,
				index: (args.index as number) ?? 0,
				fuzzy: (args.fuzzy as boolean) ?? true,
			});
			const result = await page.evaluate(`(${FIND_ELEMENT_SCRIPT})(${opts})`);
			const info = result as {
				tag: string;
				text: string;
				x: number;
				y: number;
			} | null;

			if (!info) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Element not found",
						},
					],
					isError: true,
				};
			}

			// Use CDP mouse click — this dispatches all events correctly
			await page.mouse.click(info.x, info.y);

			return {
				content: [
					{
						type: "text" as const,
						text: `Clicked <${info.tag}> "${info.text}"`,
					},
				],
			};
		},
	);
}
