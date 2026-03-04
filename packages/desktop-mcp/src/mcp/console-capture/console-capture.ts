import type { ConsoleMessage, Page } from "puppeteer-core";
import type { ConsoleLogEntry } from "../../zod.js";

const LEVEL_MAP: Record<string, number> = {
	verbose: 0,
	debug: 0,
	info: 1,
	log: 1,
	warning: 2,
	warn: 2,
	error: 3,
};

export class ConsoleCapture {
	private logs: ConsoleLogEntry[] = [];
	private maxSize = 500;

	attach(page: Page) {
		page.on("console", (msg: ConsoleMessage) => {
			const level = LEVEL_MAP[msg.type()] ?? 1;
			const location = msg.location();
			this.logs.push({
				level,
				message: msg.text(),
				source: location.url ?? "",
				line: location.lineNumber ?? 0,
				timestamp: Date.now(),
			});
			if (this.logs.length > this.maxSize) this.logs.shift();
		});
	}

	getLogs({
		level,
		limit,
	}: {
		level?: number;
		limit?: number;
	}): ConsoleLogEntry[] {
		let filtered = this.logs;
		if (level !== undefined) {
			filtered = filtered.filter((log) => log.level === level);
		}
		if (limit !== undefined) {
			filtered = filtered.slice(-limit);
		}
		return filtered;
	}

	clear() {
		this.logs = [];
	}
}
