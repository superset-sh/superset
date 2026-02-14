import { z } from "zod";
import type { ToolContext } from "../index.js";

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"navigate",
		{
			description:
				"Navigate the Electron app to a URL or route path. Use 'path' for in-app navigation (hash routing), or 'url' for full URL navigation.",
			inputSchema: {
				url: z.string().optional().describe("Full URL to navigate to"),
				path: z
					.string()
					.optional()
					.describe("Route path for in-app navigation (e.g. '/settings')"),
			},
		},
		async (args) => {
			const page = await getPage();

			if (args.url) {
				await page.goto(args.url as string);
			} else if (args.path) {
				await page.evaluate(
					`window.location.hash = ${JSON.stringify(`#${args.path}`)}`,
				);
			} else {
				return {
					content: [
						{
							type: "text" as const,
							text: "Must provide url or path",
						},
					],
					isError: true,
				};
			}

			const currentUrl = page.url();
			return {
				content: [
					{
						type: "text" as const,
						text: `Navigated to ${currentUrl}`,
					},
				],
			};
		},
	);
}
