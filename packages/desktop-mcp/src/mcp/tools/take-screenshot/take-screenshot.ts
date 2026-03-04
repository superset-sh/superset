import { z } from "zod";
import type { ToolContext } from "../index.js";

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"take_screenshot",
		{
			description:
				"Take a screenshot of the Electron app window. Returns the screenshot as a base64-encoded PNG image. Use this to see what's currently displayed in the app. Always call this or inspect_dom before interacting with the UI.",
			inputSchema: {
				rect: z
					.object({
						x: z.number().describe("X coordinate of capture region"),
						y: z.number().describe("Y coordinate of capture region"),
						width: z.number().describe("Width of capture region"),
						height: z.number().describe("Height of capture region"),
					})
					.optional()
					.describe(
						"Optional region to capture. Omit to capture the full window.",
					),
			},
		},
		async (args) => {
			const page = await getPage();
			const base64 = await page.screenshot({
				encoding: "base64",
				type: "png",
				clip: args.rect
					? {
							x: args.rect.x as number,
							y: args.rect.y as number,
							width: args.rect.width as number,
							height: args.rect.height as number,
						}
					: undefined,
			});
			return {
				content: [
					{
						type: "image" as const,
						data: base64,
						mimeType: "image/png" as const,
					},
				],
			};
		},
	);
}
