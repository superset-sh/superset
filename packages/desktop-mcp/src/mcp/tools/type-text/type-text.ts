import { z } from "zod";
import type { ToolContext } from "../index.js";

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"type_text",
		{
			description:
				"Type text into a focused or selected element in the Electron app. Optionally provide a CSS selector to focus an element first. Use clearFirst to clear existing content before typing.",
			inputSchema: {
				text: z.string().describe("Text to type"),
				selector: z
					.string()
					.optional()
					.describe("CSS selector of element to focus before typing"),
				clearFirst: z
					.boolean()
					.default(false)
					.describe("Clear existing content before typing"),
			},
		},
		async (args) => {
			const page = await getPage();

			if (args.selector) {
				await page.click(args.selector as string);
			}

			if (args.clearFirst) {
				// Select all then type to replace
				await page.keyboard.down("Meta");
				await page.keyboard.press("a");
				await page.keyboard.up("Meta");
			}

			await page.keyboard.type(args.text as string);

			return {
				content: [
					{
						type: "text" as const,
						text: `Typed "${args.text}"`,
					},
				],
			};
		},
	);
}
