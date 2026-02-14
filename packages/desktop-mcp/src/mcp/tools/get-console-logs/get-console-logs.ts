import { z } from "zod";
import type { ToolContext } from "../index.js";

const LEVEL_NAMES: Record<number, string> = {
	0: "DEBUG",
	1: "LOG",
	2: "WARN",
	3: "ERROR",
};

const LEVEL_MAP: Record<string, number> = {
	debug: 0,
	log: 1,
	info: 1,
	warn: 2,
	error: 3,
};

export function register({ server, consoleCapture }: ToolContext) {
	server.registerTool(
		"get_console_logs",
		{
			description:
				"Get buffered console output from the Electron app renderer process. Shows console.log, console.warn, console.error output. Critical for debugging runtime issues.",
			inputSchema: {
				level: z
					.enum(["log", "warn", "error", "debug"])
					.optional()
					.describe("Filter by log level"),
				limit: z
					.number()
					.int()
					.min(1)
					.default(50)
					.describe("Max entries to return (default 50)"),
				clear: z
					.boolean()
					.default(false)
					.describe("Clear buffer after reading"),
			},
		},
		async (args) => {
			const levelNum = args.level ? LEVEL_MAP[args.level as string] : undefined;
			const logs = consoleCapture.getLogs({
				level: levelNum,
				limit: args.limit as number | undefined,
			});

			if (args.clear) consoleCapture.clear();

			const lines = logs.map((log) => {
				const level = LEVEL_NAMES[log.level] || String(log.level);
				const time = new Date(log.timestamp).toISOString().slice(11, 23);
				return `[${time}] ${level}: ${log.message}`;
			});

			return {
				content: [
					{
						type: "text" as const,
						text: lines.length > 0 ? lines.join("\n") : "No console logs",
					},
				],
			};
		},
	);
}
