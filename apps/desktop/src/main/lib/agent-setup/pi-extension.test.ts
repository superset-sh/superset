import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import * as realOs from "node:os";
import path from "node:path";

/**
 * Regression coverage for #5828.
 *
 * The generated pi extension must register its lifecycle handlers in *any*
 * Superset terminal stack that the shared notify.sh still supports. notify.sh
 * retains a v1 Electron fallback that dispatches using SUPERSET_TAB_ID /
 * SUPERSET_PANE_ID, so the extension gate must not require SUPERSET_TERMINAL_ID.
 *
 * This test renders the real template, writes it to disk, dynamically imports
 * it (the `import type` line is erased by the TS runtime, so no pi dependency
 * is needed), and invokes the default export with a recording `pi` stub under
 * both the v2 and v1 environment shapes.
 */

import { getPiExtensionContent } from "./agent-wrappers-pi";

const SUPERSET_ENV_KEYS = [
	"SUPERSET_TERMINAL_ID",
	"SUPERSET_HOST_AGENT_HOOK_URL",
	"SUPERSET_TAB_ID",
	"SUPERSET_PANE_ID",
	"SUPERSET_HOME_DIR",
] as const;

type PiHandler = (event: unknown, ctx: { hasUI?: boolean }) => void;

let tmpRoot: string;
let supersetHome: string;
const savedEnv: Record<string, string | undefined> = {};
let moduleCounter = 0;

function clearSupersetEnv() {
	for (const key of SUPERSET_ENV_KEYS) {
		delete process.env[key];
	}
}

/**
 * Renders the template, writes it to a unique temp module (unique so the
 * dynamic-import cache does not return a stale copy), and loads its default
 * export.
 */
async function loadExtension(): Promise<(pi: unknown) => void> {
	const content = getPiExtensionContent();
	const modulePath = path.join(tmpRoot, `pi-extension-${moduleCounter++}.ts`);
	writeFileSync(modulePath, content, "utf-8");
	const mod = await import(modulePath);
	return mod.default;
}

/**
 * Invokes the extension with a stub `pi` and returns the set of lifecycle
 * events it registered handlers for.
 */
function registeredEvents(extension: (pi: unknown) => void): string[] {
	const events: string[] = [];
	const pi = {
		on(eventName: string, _handler: PiHandler) {
			events.push(eventName);
		},
	};
	extension(pi);
	return events;
}

describe("pi extension (#5828)", () => {
	beforeEach(() => {
		for (const key of SUPERSET_ENV_KEYS) {
			savedEnv[key] = process.env[key];
		}
		tmpRoot = mkdtempSync(path.join(realOs.tmpdir(), "pi-extension-test-"));
		// notify.sh must exist or the extension returns before registering.
		supersetHome = path.join(tmpRoot, ".superset");
		const hooksDir = path.join(supersetHome, "hooks");
		mkdirSync(hooksDir, { recursive: true });
		const notifyScript = path.join(hooksDir, "notify.sh");
		writeFileSync(notifyScript, "#!/bin/bash\nexit 0\n", "utf-8");
		chmodSync(notifyScript, 0o755);
		clearSupersetEnv();
	});

	afterEach(() => {
		for (const key of SUPERSET_ENV_KEYS) {
			if (savedEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = savedEnv[key];
			}
		}
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("registers lifecycle handlers in a v2 terminal (SUPERSET_TERMINAL_ID)", async () => {
		process.env.SUPERSET_HOME_DIR = supersetHome;
		process.env.SUPERSET_TERMINAL_ID = "term-123";
		process.env.SUPERSET_HOST_AGENT_HOOK_URL = "http://127.0.0.1:9999/hook";

		const extension = await loadExtension();
		const events = registeredEvents(extension);

		expect(events).toContain("before_agent_start");
		expect(events).toContain("agent_end");
	});

	it("registers lifecycle handlers in a v1 terminal (SUPERSET_TAB_ID / SUPERSET_PANE_ID)", async () => {
		process.env.SUPERSET_HOME_DIR = supersetHome;
		process.env.SUPERSET_TAB_ID = "tab-123";
		process.env.SUPERSET_PANE_ID = "pane-123";

		const extension = await loadExtension();
		const events = registeredEvents(extension);

		// Regression for #5828: the extension previously gated solely on
		// SUPERSET_TERMINAL_ID and registered nothing here, even though
		// notify.sh still dispatches v1 events via SUPERSET_TAB_ID/PANE_ID.
		expect(events).toContain("before_agent_start");
		expect(events).toContain("agent_end");
	});

	it("is a no-op outside any Superset terminal", async () => {
		process.env.SUPERSET_HOME_DIR = supersetHome;

		const extension = await loadExtension();
		const events = registeredEvents(extension);

		expect(events).toEqual([]);
	});
});
