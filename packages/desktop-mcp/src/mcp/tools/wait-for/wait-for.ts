import { z } from "zod";
import type { ToolContext } from "../index.js";

interface WaitForOptions {
	selector: string | null;
	text: string | null;
	testId: string | null;
	urlIncludes: string | null;
	fuzzy: boolean;
	absent: boolean;
}

interface WaitForResult {
	kind: string;
	text?: string;
	url?: string;
	selector?: string;
	tag?: string;
}

function evaluateWaitForCondition(opts: WaitForOptions): WaitForResult | false {
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
		const matchesUrl = window.location.href.includes(urlIncludes);
		match = matchesUrl ? { kind: "url", url: window.location.href } : null;
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

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"wait_for",
		{
			description:
				"Wait for a non-brittle desktop app condition before asserting or interacting: URL includes text, visible selector, visible data-testid, or visible text. Can also wait for a condition to be absent.",
			inputSchema: {
				selector: z
					.string()
					.optional()
					.describe("Visible CSS selector to wait for"),
				text: z.string().optional().describe("Visible text to wait for"),
				testId: z
					.string()
					.optional()
					.describe("Visible data-testid to wait for"),
				urlIncludes: z
					.string()
					.optional()
					.describe("Substring that must appear in window.location.href"),
				absent: z
					.boolean()
					.default(false)
					.describe("Wait until the condition is absent instead of present"),
				fuzzy: z
					.boolean()
					.default(true)
					.describe("Use partial case-insensitive text matching"),
				timeoutMs: z
					.number()
					.int()
					.min(100)
					.max(120_000)
					.default(10_000)
					.describe("Maximum wait time in milliseconds"),
			},
		},
		async (args) => {
			const page = await getPage();
			const hasTarget = Boolean(
				args.selector || args.text || args.testId || args.urlIncludes,
			);
			if (!hasTarget) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Must provide selector, text, testId, or urlIncludes",
						},
					],
					isError: true,
				};
			}

			try {
				const handle = await page.waitForFunction(
					evaluateWaitForCondition,
					{ timeout: args.timeoutMs as number },
					{
						selector: (args.selector as string | undefined) ?? null,
						text: (args.text as string | undefined) ?? null,
						testId: (args.testId as string | undefined) ?? null,
						urlIncludes: (args.urlIncludes as string | undefined) ?? null,
						absent: (args.absent as boolean | undefined) ?? false,
						fuzzy: (args.fuzzy as boolean | undefined) ?? true,
					},
				);
				const result = (await handle.jsonValue()) as WaitForResult;
				const detail =
					result.kind === "url"
						? result.url
						: result.kind === "element"
							? `<${result.tag}> ${result.selector} "${result.text ?? ""}"`
							: "condition absent";
				return {
					content: [
						{
							type: "text" as const,
							text: `Wait condition satisfied: ${detail}`,
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Wait condition timed out: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
