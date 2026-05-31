import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { config } from "dotenv";
import {
	type ConsoleLogsOptions,
	DesktopAutomation,
	type DomElement,
	type ScreenshotRect,
	type ScreenshotResult,
	type WaitForOptions,
	type WaitForResult,
	type WindowInfo,
} from "../automation/index.js";
import type { ConsoleLogEntry } from "../zod.js";
import {
	getBooleanFlag,
	getIntegerFlag,
	getNumberFlag,
	getStringFlag,
	type ParsedCliArgs,
	parseCliArgs,
} from "./args.js";

const HELP = `Desktop automation CLI

Usage:
  bun run desktop:automation -- <command> [options]

Commands:
  window-info                         Print current app URL, viewport, focus state
  inspect-dom [--interactive-only]    Print visible DOM elements
  wait-for --url-includes <text>      Wait for URL/text/selector/test-id readiness
  screenshot --path <file.png>        Save a screenshot artifact
  click [--selector|--text|--test-id] Click an element or --x/--y coordinates
  type-text --text <text>             Type text, optionally into --selector
  send-keys --keys Meta,t             Send a key chord
  console-logs [--level error]        Print buffered renderer console logs
  evaluate-js --code <js>             Evaluate JavaScript in the renderer
  navigate --path /settings           Navigate by hash path, or use --url
  smoke                               Run a Trellis-friendly desktop smoke

Common:
  --json                              Print JSON instead of text

Smoke example:
  bun run desktop:automation -- smoke \\
    --url-includes "#/sign-in" \\
    --screenshot .trellis/tasks/<task>/artifacts/sign-in.png \\
    --report .trellis/tasks/<task>/artifacts/sign-in-smoke.json
`;

interface CliIO {
	write: (message: string) => void;
	writeError: (message: string) => void;
}

interface SmokeReport {
	startedAt: string;
	completedAt: string;
	windowInfo: WindowInfo;
	wait?: WaitForResult;
	dom: DomElement[];
	screenshot?: Omit<ScreenshotResult, "image">;
	consoleLogs: ConsoleLogEntry[];
}

const LEVEL_NAMES: Record<number, string> = {
	0: "DEBUG",
	1: "LOG",
	2: "WARN",
	3: "ERROR",
};

function resolveWorkspaceJsonPath(path: string, cwd = process.cwd()): string {
	const resolvedCwd = resolve(cwd);
	const resolvedPath = isAbsolute(path)
		? resolve(path)
		: resolve(resolvedCwd, path);
	if (
		resolvedPath !== resolvedCwd &&
		!resolvedPath.startsWith(`${resolvedCwd}/`)
	) {
		throw new Error(
			`Report path must stay inside the repository workspace: ${path}`,
		);
	}
	if (!resolvedPath.endsWith(".json")) {
		throw new Error("Report path must end with .json");
	}
	return resolvedPath;
}

function parseRect(value: string | undefined): ScreenshotRect | undefined {
	if (!value) return undefined;
	const [x, y, width, height] = value.split(",").map(Number);
	if (
		x === undefined ||
		y === undefined ||
		width === undefined ||
		height === undefined ||
		![x, y, width, height].every(Number.isFinite)
	) {
		throw new Error("--rect must be x,y,width,height");
	}
	return { x, y, width, height };
}

function parseKeys(args: ParsedCliArgs): string[] {
	const flag = getStringFlag(args, "keys");
	const rawKeys = flag ? flag.split(",") : args.positionals;
	const keys = rawKeys.map((key) => key.trim()).filter(Boolean);
	if (keys.length === 0)
		throw new Error("send-keys requires --keys or positionals");
	return keys;
}

function waitOptionsFromArgs(args: ParsedCliArgs): WaitForOptions {
	const options: WaitForOptions = {
		selector: getStringFlag(args, "selector"),
		text: getStringFlag(args, "text"),
		testId: getStringFlag(args, "test-id"),
		urlIncludes: getStringFlag(args, "url-includes"),
		absent: getBooleanFlag(args, "absent"),
		fuzzy: !getBooleanFlag(args, "exact"),
		timeoutMs: getIntegerFlag(args, "timeout-ms"),
	};
	if (
		!options.selector &&
		!options.text &&
		!options.testId &&
		!options.urlIncludes
	) {
		throw new Error(
			"wait-for requires --url-includes, --selector, --text, or --test-id",
		);
	}
	return options;
}

function consoleOptionsFromArgs(args: ParsedCliArgs): ConsoleLogsOptions {
	const level = getStringFlag(args, "level") as ConsoleLogsOptions["level"];
	return {
		level,
		limit: getIntegerFlag(args, "limit"),
		clear: getBooleanFlag(args, "clear"),
	};
}

function textOrJson(
	args: ParsedCliArgs,
	value: unknown,
	formatter: () => string,
): string {
	return getBooleanFlag(args, "json")
		? JSON.stringify(value, null, 2)
		: formatter();
}

function formatWindowInfo(info: WindowInfo): string {
	return [
		`Title: ${info.title}`,
		`URL: ${info.url}`,
		`Viewport: ${info.viewportWidth}x${info.viewportHeight}`,
		`Focused: ${info.focused}`,
	].join("\n");
}

function formatDomElements(elements: DomElement[]): string {
	if (elements.length === 0) return "No elements found";
	return elements
		.map((el) => {
			const attrs = [
				el.interactive ? "interactive" : "",
				el.disabled ? "disabled" : "",
				el.focused ? "focused" : "",
				el.role ? `role=${el.role}` : "",
				el.testId ? `testid=${el.testId}` : "",
			]
				.filter(Boolean)
				.join(", ");
			return `[${el.tag}] ${el.selector}${el.text ? ` - "${el.text.slice(0, 80)}"` : ""}${attrs ? ` (${attrs})` : ""} @ ${el.bounds.x},${el.bounds.y} ${el.bounds.width}x${el.bounds.height}`;
		})
		.join("\n");
}

function formatWaitResult(result: WaitForResult): string {
	if (result.kind === "url") return `Wait condition satisfied: ${result.url}`;
	if (result.kind === "element") {
		return `Wait condition satisfied: <${result.tag}> ${result.selector} "${result.text ?? ""}"`;
	}
	return "Wait condition satisfied: condition absent";
}

function formatConsoleLogs(logs: ConsoleLogEntry[]): string {
	if (logs.length === 0) return "No console logs";
	return logs
		.map((log) => {
			const level = LEVEL_NAMES[log.level] ?? String(log.level);
			const time = new Date(log.timestamp).toISOString().slice(11, 23);
			return `[${time}] ${level}: ${log.message}`;
		})
		.join("\n");
}

function screenshotSummary(screenshot: ScreenshotResult) {
	return {
		path: screenshot.path,
		width: screenshot.width,
		height: screenshot.height,
	};
}

async function writeJsonFile(path: string, data: unknown): Promise<string> {
	const resolvedPath = resolveWorkspaceJsonPath(path);
	await mkdir(dirname(resolvedPath), { recursive: true });
	await writeFile(resolvedPath, `${JSON.stringify(data, null, 2)}\n`);
	return resolvedPath;
}

async function runSmoke(
	automation: DesktopAutomation,
	args: ParsedCliArgs,
): Promise<SmokeReport & { reportPath?: string }> {
	const startedAt = new Date().toISOString();
	const windowInfo = await automation.getWindowInfo();
	const hasWait =
		getStringFlag(args, "selector") ||
		getStringFlag(args, "text") ||
		getStringFlag(args, "test-id") ||
		getStringFlag(args, "url-includes");
	const wait = hasWait
		? await automation.waitFor(waitOptionsFromArgs(args))
		: undefined;
	const dom = await automation.inspectDom({
		selector: getStringFlag(args, "dom-selector"),
		interactiveOnly: getBooleanFlag(args, "interactive-only", true),
	});
	const screenshotPath = getStringFlag(args, "screenshot");
	const screenshot = screenshotPath
		? await automation.takeScreenshot({ path: screenshotPath })
		: undefined;
	const consoleLogs = await automation.getConsoleLogs(
		consoleOptionsFromArgs(args),
	);
	const completedAt = new Date().toISOString();
	const report: SmokeReport = {
		startedAt,
		completedAt,
		windowInfo,
		...(wait ? { wait } : {}),
		dom,
		...(screenshot ? { screenshot: screenshotSummary(screenshot) } : {}),
		consoleLogs,
	};
	const reportPath = getStringFlag(args, "report");
	if (!reportPath) return report;
	return { ...report, reportPath: await writeJsonFile(reportPath, report) };
}

async function runCommand(
	automation: DesktopAutomation,
	args: ParsedCliArgs,
): Promise<unknown> {
	switch (args.command) {
		case "help":
		case "--help":
		case "-h":
			return HELP;
		case "window-info":
			return automation.getWindowInfo();
		case "inspect-dom":
			return automation.inspectDom({
				selector: getStringFlag(args, "selector"),
				interactiveOnly: getBooleanFlag(args, "interactive-only"),
			});
		case "wait-for":
			return automation.waitFor(waitOptionsFromArgs(args));
		case "screenshot":
			return automation.takeScreenshot({
				path: getStringFlag(args, "path"),
				rect: parseRect(getStringFlag(args, "rect")),
			});
		case "click":
			return automation.click({
				selector: getStringFlag(args, "selector"),
				text: getStringFlag(args, "text"),
				testId: getStringFlag(args, "test-id"),
				x: getNumberFlag(args, "x"),
				y: getNumberFlag(args, "y"),
				index: getIntegerFlag(args, "index"),
				fuzzy: !getBooleanFlag(args, "exact"),
			});
		case "type-text": {
			const text = getStringFlag(args, "text") ?? args.positionals.join(" ");
			if (!text)
				throw new Error("type-text requires --text or positional text");
			return automation.typeText({
				text,
				selector: getStringFlag(args, "selector"),
				clearFirst: getBooleanFlag(args, "clear-first"),
			});
		}
		case "send-keys":
			return automation.sendKeys({ keys: parseKeys(args) });
		case "console-logs":
			return automation.getConsoleLogs(consoleOptionsFromArgs(args));
		case "evaluate-js": {
			const code = getStringFlag(args, "code") ?? args.positionals.join(" ");
			if (!code)
				throw new Error("evaluate-js requires --code or positional code");
			return automation.evaluateJs(code);
		}
		case "navigate":
			return automation.navigate({
				url: getStringFlag(args, "url"),
				path: getStringFlag(args, "path"),
			});
		case "smoke":
			return runSmoke(automation, args);
		default:
			throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
	}
}

function formatResult(args: ParsedCliArgs, result: unknown): string {
	switch (args.command) {
		case "help":
		case "--help":
		case "-h":
			return String(result);
		case "window-info":
			return textOrJson(args, result, () =>
				formatWindowInfo(result as WindowInfo),
			);
		case "inspect-dom":
			return textOrJson(args, result, () =>
				formatDomElements(result as DomElement[]),
			);
		case "wait-for":
			return textOrJson(args, result, () =>
				formatWaitResult(result as WaitForResult),
			);
		case "screenshot": {
			const screenshot = result as ScreenshotResult;
			return textOrJson(args, screenshotSummary(screenshot), () =>
				screenshot.path
					? `Saved screenshot to ${screenshot.path}`
					: `Captured screenshot ${screenshot.width}x${screenshot.height}`,
			);
		}
		case "click":
		case "type-text":
		case "send-keys":
			return textOrJson(
				args,
				result,
				() => (result as { message: string }).message,
			);
		case "console-logs":
			return textOrJson(args, result, () =>
				formatConsoleLogs(result as ConsoleLogEntry[]),
			);
		case "evaluate-js":
		case "navigate":
			return typeof result === "string"
				? result
				: JSON.stringify(result, null, 2);
		case "smoke": {
			const report = result as SmokeReport & { reportPath?: string };
			return textOrJson(args, report, () => {
				const lines = [
					`Desktop smoke passed: ${report.windowInfo.url}`,
					`DOM elements: ${report.dom.length}`,
					`Console logs: ${report.consoleLogs.length}`,
				];
				if (report.screenshot?.path) {
					lines.push(`Screenshot: ${report.screenshot.path}`);
				}
				if (report.reportPath) lines.push(`Report: ${report.reportPath}`);
				return lines.join("\n");
			});
		}
		default:
			return JSON.stringify(result, null, 2);
	}
}

export async function runDesktopAutomationCli(
	argv = process.argv.slice(2),
	io: CliIO = {
		write: (message) => console.log(message),
		writeError: (message) => console.error(message),
	},
): Promise<number> {
	config({
		path: resolve(import.meta.dirname, "../../../../.env"),
		quiet: true,
	});
	process.env.DESKTOP_AUTOMATION_PORT ??= "9322";
	const args = parseCliArgs(argv);
	const automation = new DesktopAutomation();
	try {
		const result = await runCommand(automation, args);
		io.write(formatResult(args, result));
		return 0;
	} catch (error) {
		io.writeError(error instanceof Error ? error.message : String(error));
		return 1;
	} finally {
		automation.disconnect();
	}
}
