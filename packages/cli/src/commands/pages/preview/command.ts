import { mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import {
	boolean,
	CLIError,
	number,
	positional,
	string,
} from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { capturePreview, type Theme } from "./utils/capturePreview";
import { findChrome } from "./utils/findChrome";
import { launchChrome } from "./utils/launchChrome";
import { formatPreviewReport, previewIssues } from "./utils/previewReport";
import { resolvePreviewSite, startPreviewServers } from "./utils/servePreview";

const DEFAULT_WIDTHS = [1280, 390];
const DEFAULT_THEMES: Theme[] = ["light", "dark"];
const MAX_WIDTHS = 3;
const STEP_TIMEOUT_MS = 20_000;
const START_TIMEOUT_MS = 60_000;

export function parseWidths(value: string | undefined): number[] {
	if (!value) return DEFAULT_WIDTHS;
	const widths = value
		.split(",")
		.map((part) => Number(part.trim()))
		.filter((width) => Number.isFinite(width) && width > 0)
		.map((width) => Math.min(2560, Math.max(320, Math.round(width))));
	if (widths.length === 0 || widths.length > MAX_WIDTHS) {
		throw new CLIError(
			`--widths takes 1 to ${MAX_WIDTHS} widths, like 1280,390`,
		);
	}
	return widths;
}

export function parseThemes(value: string | undefined): Theme[] {
	if (!value) return DEFAULT_THEMES;
	const themes = value.split(",").map((part) => part.trim());
	if (
		!themes.every(
			(theme): theme is Theme => theme === "light" || theme === "dark",
		)
	) {
		throw new CLIError("--themes takes light, dark, or light,dark");
	}
	return [...new Set(themes)];
}

export default command({
	description:
		"Render a page the way it looks once published and save screenshots of it, or serve it with --serve",
	args: [
		positional("path")
			.required()
			.desc(
				"Path to the .html file, or a directory whose index.html is the page",
			),
	],
	options: {
		widths: string().desc(
			"Viewport widths to capture (default 1280,390; at most 3)",
		),
		themes: string().desc("Colour schemes to capture (default light,dark)"),
		out: string().desc(
			"Directory for the screenshots (default: a new temp directory)",
		),
		serve: boolean().desc(
			"Serve the page on 127.0.0.1 instead of capturing it",
		),
		port: number().desc("Port for --serve (defaults to a free one)"),
	},
	skipMiddleware: true,
	run: async ({ args, options, signal }) => {
		const site = resolvePreviewSite(
			resolve(process.cwd(), args.path as string),
		);

		if (options.serve) {
			const servers = startPreviewServers(site, options.port ?? 0);
			process.stdout.write(
				`Previewing ${site.entry} at ${servers.pageUrl}\nEdits show on reload. Stop with Ctrl-C.\n`,
			);
			await new Promise((stopped) =>
				signal.addEventListener("abort", stopped, { once: true }),
			);
			servers.stop();
			return undefined;
		}

		const widths = parseWidths(options.widths);
		const themes = parseThemes(options.themes);
		const executable = findChrome();
		if (!executable) {
			throw new CLIError(
				"Chrome not found, so the page could not be rendered",
				"Install Chrome or Chromium, run `npx playwright install chromium`, or set SUPERSET_CHROME_PATH. To look at it yourself: superset pages preview <path> --serve",
			);
		}
		const outDir = options.out
			? resolve(process.cwd(), options.out)
			: mkdtempSync(resolve(tmpdir(), "superset-page-shots-"));
		mkdirSync(outDir, { recursive: true });

		const servers = startPreviewServers(site);
		let chrome: Awaited<ReturnType<typeof launchChrome>> | undefined;
		try {
			chrome = await launchChrome(executable, {
				startTimeoutMs: START_TIMEOUT_MS,
				commandTimeoutMs: STEP_TIMEOUT_MS,
			});
			const findings = await capturePreview({
				cdp: chrome.cdp,
				wrapperUrl: servers.wrapperUrl,
				widths,
				themes,
				outDir,
			});
			const bytes = statSync(site.entry).size;
			const issues = previewIssues(findings, {
				missing: servers.missing,
				bytes,
			});
			const report = formatPreviewReport({
				name: basename(site.entry),
				bytes,
				widths,
				themes,
				findings,
				issues,
				token: crypto.randomUUID().slice(0, 8),
			});
			return {
				data: { report, ...findings, issues, browser: executable },
				message: report,
			};
		} catch (error) {
			throw new CLIError(
				"Could not preview the page",
				`${error instanceof Error ? error.message : String(error)}. To look at it yourself: superset pages preview <path> --serve`,
			);
		} finally {
			await chrome?.close();
			servers.stop();
		}
	},
});
