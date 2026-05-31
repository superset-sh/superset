import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { ToolContext } from "../index.js";

export function resolveScreenshotPath(
	path: string,
	cwd = process.cwd(),
): string {
	const resolvedCwd = resolve(cwd);
	const resolvedPath = isAbsolute(path)
		? resolve(path)
		: resolve(resolvedCwd, path);
	if (
		resolvedPath !== resolvedCwd &&
		!resolvedPath.startsWith(`${resolvedCwd}/`)
	) {
		throw new Error(
			`Screenshot path must stay inside the repository workspace: ${path}`,
		);
	}
	if (!resolvedPath.endsWith(".png")) {
		throw new Error("Screenshot path must end with .png");
	}
	return resolvedPath;
}

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"take_screenshot",
		{
			description:
				"Take a screenshot of the Electron app window. Returns the screenshot as a base64-encoded PNG image and can also save it to a workspace-relative .png path for Trellis validation artifacts. Use this to see what's currently displayed in the app. Always call this or inspect_dom before interacting with the UI.",
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
				path: z
					.string()
					.optional()
					.describe(
						"Optional workspace-relative .png path to save the screenshot artifact.",
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
			const content: Array<
				| { type: "text"; text: string }
				| { type: "image"; data: string; mimeType: "image/png" }
			> = [];
			if (args.path) {
				const path = resolveScreenshotPath(args.path as string);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, Buffer.from(base64, "base64"));
				content.push({
					type: "text" as const,
					text: `Saved screenshot to ${path}`,
				});
			}
			content.push({
				type: "image" as const,
				data: base64,
				mimeType: "image/png" as const,
			});
			return {
				content,
			};
		},
	);
}
