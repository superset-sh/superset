import type { KeyInput } from "puppeteer-core";
import { z } from "zod";
import type { ToolContext } from "../index.js";

/**
 * Map from human-readable key names to CDP key identifiers.
 * @see https://pptr.dev/api/puppeteer.keyinput
 */
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

export function register({ server, getPage }: ToolContext) {
	server.registerTool(
		"send_keys",
		{
			description:
				'Send keyboard shortcuts or key presses to the Electron app. Provide an array of keys to press simultaneously. Use modifier names like "Meta" (Cmd), "Control", "Alt", "Shift" combined with a key. Examples: ["Meta", "t"] for Cmd+T, ["Meta", "Shift", "p"] for Cmd+Shift+P, ["Escape"] for Esc, ["Enter"] for Enter.',
			inputSchema: {
				keys: z
					.array(z.string())
					.describe(
						'Keys to press simultaneously, e.g. ["Meta", "t"] for Cmd+T',
					),
			},
		},
		async (args) => {
			const page = await getPage();
			const keys = (args.keys as string[]).map(normalizeKey);

			const modifiers = keys.filter((k) => MODIFIER_KEYS.has(k));
			const nonModifiers = keys.filter((k) => !MODIFIER_KEYS.has(k));

			// Hold modifiers, press the key, release modifiers
			for (const mod of modifiers) {
				await page.keyboard.down(mod as KeyInput);
			}

			if (nonModifiers.length > 0) {
				for (const key of nonModifiers) {
					await page.keyboard.press(key as KeyInput);
				}
			} else if (modifiers.length > 0) {
				// All modifiers with no key — press the last modifier
				await page.keyboard.press(modifiers[modifiers.length - 1] as KeyInput);
			}

			for (const mod of modifiers.reverse()) {
				await page.keyboard.up(mod as KeyInput);
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `Sent keys: ${(args.keys as string[]).join("+")}`,
					},
				],
			};
		},
	);
}
