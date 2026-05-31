import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { KeyInput, Page } from "puppeteer-core";
import { ConnectionManager } from "../mcp/connection/index.js";
import { DOM_INSPECTOR_SCRIPT } from "../mcp/dom-inspector/index.js";
import { resolveScreenshotPath } from "../mcp/tools/take-screenshot/take-screenshot.js";
import type { ConsoleLogEntry } from "../zod.js";

export interface ScreenshotRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenshotResult {
	image: string;
	path?: string;
	width: number;
	height: number;
}

export interface DomElement {
	tag: string;
	id?: string;
	classes: string[];
	text: string;
	selector: string;
	bounds: { x: number; y: number; width: number; height: number };
	role?: string;
	testId?: string;
	interactive: boolean;
	disabled: boolean;
	checked?: boolean;
	focused: boolean;
	visible: boolean;
}

export interface WindowInfo {
	title: string;
	url: string;
	viewportWidth: number;
	viewportHeight: number;
	focused: boolean;
}

export interface ClickOptions {
	selector?: string;
	text?: string;
	testId?: string;
	x?: number;
	y?: number;
	index?: number;
	fuzzy?: boolean;
}

export interface ClickResult {
	message: string;
	element?: {
		tag: string;
		text: string;
		selector?: string;
		x: number;
		y: number;
	};
}

export interface TypeTextOptions {
	text: string;
	selector?: string;
	clearFirst?: boolean;
}

export interface SendKeysOptions {
	keys: string[];
}

export interface ConsoleLogsOptions {
	level?: "debug" | "log" | "info" | "warn" | "error";
	limit?: number;
	clear?: boolean;
}

export interface NavigateOptions {
	url?: string;
	path?: string;
}

export interface WaitForOptions {
	selector?: string;
	text?: string;
	testId?: string;
	urlIncludes?: string;
	fuzzy?: boolean;
	absent?: boolean;
	timeoutMs?: number;
}

export interface WaitForResult {
	kind: string;
	text?: string;
	url?: string;
	selector?: string;
	tag?: string;
}

const ROUTER_HISTORY_STORAGE_KEY = "router-history";
const MAX_ROUTER_HISTORY_ENTRIES = 100;

export function normalizeHashPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return "/";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function buildRouterHistoryStateForPath(
	path: string,
	rawState: string | null,
): string {
	let entries = ["/"];
	let index = 0;

	try {
		if (rawState) {
			const parsed = JSON.parse(rawState) as {
				entries?: unknown;
				index?: unknown;
			};
			if (
				Array.isArray(parsed.entries) &&
				parsed.entries.every(
					(entry) => typeof entry === "string" && entry.length > 0,
				)
			) {
				entries = parsed.entries;
				index =
					typeof parsed.index === "number"
						? Math.min(Math.max(parsed.index, 0), entries.length - 1)
						: entries.length - 1;
			}
		}
	} catch {}

	const nextEntries = entries.slice(0, index + 1);
	if (nextEntries[nextEntries.length - 1] !== path) {
		nextEntries.push(path);
	}
	const cappedEntries =
		nextEntries.length > MAX_ROUTER_HISTORY_ENTRIES
			? nextEntries.slice(nextEntries.length - MAX_ROUTER_HISTORY_ENTRIES)
			: nextEntries;

	return JSON.stringify({
		entries: cappedEntries,
		index: cappedEntries.length - 1,
	});
}

const FIND_ELEMENT_SCRIPT = `(opts) => {
	const { selector, text, testId, index, fuzzy } = opts;
	let el;

	if (selector) {
		el = document.querySelectorAll(selector)[index];
	} else if (testId) {
		el = document.querySelectorAll('[data-testid="' + testId + '"]')[index];
	} else if (text) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		const matches = [];
		let node;
		while (node = walker.nextNode()) {
			const content = node.textContent.trim();
			if (fuzzy
				? content.toLowerCase().includes(text.toLowerCase())
				: content === text) {
				matches.push(node.parentElement);
			}
		}
		el = matches[index];
	}

	if (!el) return null;

	el.scrollIntoView({ block: 'nearest' });
	const rect = el.getBoundingClientRect();
	return {
		tag: el.tagName.toLowerCase(),
		text: (el.textContent || '').trim().slice(0, 100),
		selector: el.id ? '#' + CSS.escape(el.id) : undefined,
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
	};
}`;

const LEVEL_MAP: Record<string, number> = {
	debug: 0,
	log: 1,
	info: 1,
	warn: 2,
	error: 3,
};

const KEY_MAP: Record<string, string> = {
	meta: "Meta",
	cmd: "Meta",
	command: "Meta",
	ctrl: "Control",
	control: "Control",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
	enter: "Enter",
	return: "Enter",
	escape: "Escape",
	esc: "Escape",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	space: " ",
	arrowup: "ArrowUp",
	arrowdown: "ArrowDown",
	arrowleft: "ArrowLeft",
	arrowright: "ArrowRight",
	up: "ArrowUp",
	down: "ArrowDown",
	left: "ArrowLeft",
	right: "ArrowRight",
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

function normalizeKey(key: string): string {
	return KEY_MAP[key.toLowerCase()] ?? key;
}

function evaluateWaitForCondition(opts: {
	selector: string | null;
	text: string | null;
	testId: string | null;
	urlIncludes: string | null;
	fuzzy: boolean;
	absent: boolean;
}): WaitForResult | false {
	const { selector, text, testId, urlIncludes, fuzzy, absent } = opts;

	const isVisible = (el: Element | null): el is HTMLElement => {
		if (!(el instanceof HTMLElement)) return false;
		const rect = el.getBoundingClientRect();
		const style = window.getComputedStyle(el);
		return (
			(rect.width > 0 || rect.height > 0) &&
			style.display !== "none" &&
			style.visibility !== "hidden" &&
			Number.parseFloat(style.opacity || "1") !== 0
		);
	};

	let match: WaitForResult | null = null;

	if (urlIncludes) {
		match = window.location.href.includes(urlIncludes)
			? { kind: "url", url: window.location.href }
			: null;
	}

	if (!match && selector) {
		const el = Array.from(document.querySelectorAll(selector)).find(isVisible);
		match = el
			? {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 100),
					selector,
				}
			: null;
	}

	if (!match && testId) {
		const testIdSelector = `[data-testid="${testId}"]`;
		const el = Array.from(document.querySelectorAll(testIdSelector)).find(
			isVisible,
		);
		match = el
			? {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 100),
					selector: testIdSelector,
				}
			: null;
	}

	if (!match && text) {
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_TEXT,
		);
		let node = walker.nextNode();
		while (node) {
			const content = (node.textContent || "").trim();
			const matchesText = fuzzy
				? content.toLowerCase().includes(text.toLowerCase())
				: content === text;
			if (matchesText && isVisible(node.parentElement)) {
				const el = node.parentElement;
				match = {
					kind: "element",
					tag: el.tagName.toLowerCase(),
					text: content.slice(0, 100),
					selector: el.id ? `#${CSS.escape(el.id)}` : el.tagName.toLowerCase(),
				};
				break;
			}
			node = walker.nextNode();
		}
	}

	if (absent) return match ? false : { kind: "absent" };
	return match || false;
}

async function getPageSize(page: Page, rect?: ScreenshotRect) {
	if (rect) return { width: rect.width, height: rect.height };
	return page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
}

export class DesktopAutomation {
	constructor(private readonly connection = new ConnectionManager()) {}

	disconnect(): void {
		this.connection.disconnect();
	}

	async getWindowInfo(): Promise<WindowInfo> {
		const page = await this.connection.getPage();
		const info = (await page.evaluate(() => ({
			title: document.title,
			url: window.location.href,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
			focused: document.hasFocus(),
		}))) as WindowInfo;
		const viewport = page.viewport();
		return {
			...info,
			viewportWidth: viewport?.width ?? info.viewportWidth,
			viewportHeight: viewport?.height ?? info.viewportHeight,
		};
	}

	async inspectDom({
		selector,
		interactiveOnly = false,
	}: {
		selector?: string;
		interactiveOnly?: boolean;
	} = {}): Promise<DomElement[]> {
		const page = await this.connection.getPage();
		return page.evaluate(
			`(${DOM_INSPECTOR_SCRIPT})(${JSON.stringify({ selector, interactiveOnly })})`,
		) as Promise<DomElement[]>;
	}

	async takeScreenshot({
		rect,
		path,
	}: {
		rect?: ScreenshotRect;
		path?: string;
	} = {}): Promise<ScreenshotResult> {
		const page = await this.connection.getPage();
		const image = (await page.screenshot({
			encoding: "base64",
			type: "png",
			clip: rect,
		})) as string;
		const size = await getPageSize(page, rect);
		if (!path) return { image, ...size };

		const resolvedPath = resolveScreenshotPath(path);
		await mkdir(dirname(resolvedPath), { recursive: true });
		await writeFile(resolvedPath, Buffer.from(image, "base64"));
		return { image, path: resolvedPath, ...size };
	}

	async click(options: ClickOptions): Promise<ClickResult> {
		const page = await this.connection.getPage();

		if (options.x !== undefined && options.y !== undefined) {
			await page.mouse.click(options.x, options.y);
			return { message: `Clicked at (${options.x}, ${options.y})` };
		}

		const hasTarget = Boolean(
			options.selector || options.text || options.testId,
		);
		if (!hasTarget) {
			throw new Error(
				"Must provide selector, text, testId, or x/y coordinates",
			);
		}

		const result = (await page.evaluate(
			`(${FIND_ELEMENT_SCRIPT})(${JSON.stringify({
				selector: options.selector ?? null,
				text: options.text ?? null,
				testId: options.testId ?? null,
				index: options.index ?? 0,
				fuzzy: options.fuzzy ?? true,
			})})`,
		)) as {
			tag: string;
			text: string;
			selector?: string;
			x: number;
			y: number;
		} | null;

		if (!result) throw new Error("Element not found");

		await page.mouse.click(result.x, result.y);
		return {
			message: `Clicked <${result.tag}> "${result.text}"`,
			element: result,
		};
	}

	async typeText({
		text,
		selector,
		clearFirst = false,
	}: TypeTextOptions): Promise<{ message: string }> {
		const page = await this.connection.getPage();
		if (selector) await page.click(selector);
		if (clearFirst) {
			await page.keyboard.down("Meta");
			await page.keyboard.press("a");
			await page.keyboard.up("Meta");
		}
		await page.keyboard.type(text);
		return { message: `Typed "${text}"` };
	}

	async sendKeys({ keys }: SendKeysOptions): Promise<{ message: string }> {
		const page = await this.connection.getPage();
		const normalizedKeys = keys.map(normalizeKey);
		const modifiers = normalizedKeys.filter((key) => MODIFIER_KEYS.has(key));
		const nonModifiers = normalizedKeys.filter(
			(key) => !MODIFIER_KEYS.has(key),
		);

		for (const modifier of modifiers) {
			await page.keyboard.down(modifier as KeyInput);
		}
		if (nonModifiers.length > 0) {
			for (const key of nonModifiers) {
				await page.keyboard.press(key as KeyInput);
			}
		} else if (modifiers.length > 0) {
			await page.keyboard.press(modifiers[modifiers.length - 1] as KeyInput);
		}
		for (const modifier of modifiers.reverse()) {
			await page.keyboard.up(modifier as KeyInput);
		}

		return { message: `Sent keys: ${keys.join("+")}` };
	}

	async getConsoleLogs({
		level,
		limit,
		clear = false,
	}: ConsoleLogsOptions = {}): Promise<ConsoleLogEntry[]> {
		await this.connection.getPage();
		const logs = this.connection.consoleCapture.getLogs({
			level: level ? LEVEL_MAP[level] : undefined,
			limit,
		});
		if (clear) this.connection.consoleCapture.clear();
		return logs;
	}

	async evaluateJs(code: string): Promise<unknown> {
		const page = await this.connection.getPage();
		return page.evaluate(code);
	}

	async navigate({ url, path }: NavigateOptions): Promise<{ url: string }> {
		const page = await this.connection.getPage();
		if (url) {
			await page.goto(url);
		} else if (path) {
			const normalizedPath = normalizeHashPath(path);
			const nextHistoryState = buildRouterHistoryStateForPath(
				normalizedPath,
				await page.evaluate(
					(historyKey) => localStorage.getItem(historyKey),
					ROUTER_HISTORY_STORAGE_KEY,
				),
			);
			await page.evaluate(
				({ historyKey, historyState, targetPath }) => {
					localStorage.setItem(historyKey, historyState);
					window.location.hash = `#${targetPath}`;
					window.location.reload();
				},
				{
					historyKey: ROUTER_HISTORY_STORAGE_KEY,
					historyState: nextHistoryState,
					targetPath: normalizedPath,
				},
			);
			await page
				.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 })
				.catch(() => {});
		} else {
			throw new Error("Must provide url or path");
		}
		return { url: page.url() };
	}

	async waitFor(options: WaitForOptions): Promise<WaitForResult> {
		const page = await this.connection.getPage();
		const hasTarget = Boolean(
			options.selector || options.text || options.testId || options.urlIncludes,
		);
		if (!hasTarget) {
			throw new Error("Must provide selector, text, testId, or urlIncludes");
		}

		const handle = await page.waitForFunction(
			evaluateWaitForCondition,
			{ timeout: options.timeoutMs ?? 10_000 },
			{
				selector: options.selector ?? null,
				text: options.text ?? null,
				testId: options.testId ?? null,
				urlIncludes: options.urlIncludes ?? null,
				absent: options.absent ?? false,
				fuzzy: options.fuzzy ?? true,
			},
		);
		return (await handle.jsonValue()) as WaitForResult;
	}
}
