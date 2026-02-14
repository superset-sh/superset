import { z } from "zod";
import type { ToolContext } from "../index.js";

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"evaluate_js",
		{
			description:
				"Execute JavaScript code in the Electron app's renderer process and return the result. Use this as an escape hatch for anything not covered by other tools.",
			inputSchema: {
				code: z.string().describe("JavaScript code to execute in the renderer"),
			},
		},
		async (args) => {
			const page = await getPage();
			try {
				const result = await page.evaluate(args.code as string);
				return {
					content: [
						{
							type: "text" as const,
							text:
								typeof result === "string"
									? result
									: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
