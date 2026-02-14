import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Page } from "puppeteer-core";
import type { ConsoleCapture } from "../console-capture/index.js";
import { register as click } from "./click/index.js";
import { register as evaluateJs } from "./evaluate-js/index.js";
import { register as getConsoleLogs } from "./get-console-logs/index.js";
import { register as getWindowInfo } from "./get-window-info/index.js";
import { register as inspectDom } from "./inspect-dom/index.js";
import { register as navigate } from "./navigate/index.js";
import { register as sendKeys } from "./send-keys/index.js";
import { register as takeScreenshot } from "./take-screenshot/index.js";
import { register as typeText } from "./type-text/index.js";

export interface ToolContext {
	server: McpServer;
	getPage: () => Promise<Page>;
	consoleCapture: ConsoleCapture;
}

const allTools = [
	takeScreenshot,
	inspectDom,
	click,
	typeText,
	sendKeys,
	getConsoleLogs,
	evaluateJs,
	navigate,
	getWindowInfo,
];

export function registerTools(ctx: ToolContext) {
	for (const register of allTools) {
		register(ctx);
	}
}
