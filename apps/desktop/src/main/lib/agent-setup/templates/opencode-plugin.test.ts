import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEMPLATE_PATH = path.join(import.meta.dir, "opencode-plugin.template.js");

async function loadPlugin() {
	const template = readFileSync(TEMPLATE_PATH, "utf-8");
	const rendered = template
		.replace("{{MARKER}}", "// Superset opencode plugin test")
		.replace("{{NOTIFY_PATH}}", "/fake/notify.sh");

	const dir = mkdtempSync(path.join(tmpdir(), "opencode-plugin-test-"));
	const outPath = path.join(dir, `plugin-${Date.now()}-${Math.random()}.mjs`);
	writeFileSync(outPath, rendered);

	const module = (await import(outPath)) as {
		SupersetNotifyPlugin: (deps: {
			$: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<void>;
			client: {
				session: {
					list: () => Promise<{
						data: Array<{ id: string; parentID?: string }>;
					}>;
				};
			};
		}) => Promise<Record<string, unknown>>;
	};

	return module.SupersetNotifyPlugin;
}

function createMocks(rootSessionID = "sess-root") {
	const notifyCalls: string[] = [];
	const $ = (
		strings: TemplateStringsArray,
		...args: unknown[]
	): Promise<void> => {
		const cmd = String.raw({ raw: strings }, ...args.map((a) => String(a)));
		notifyCalls.push(cmd);
		return Promise.resolve();
	};

	const client = {
		session: {
			list: async () => ({
				data: [{ id: rootSessionID, parentID: undefined }],
			}),
		},
	};

	return { $, client, notifyCalls };
}

describe("opencode plugin", () => {
	const originalTabId = process.env.SUPERSET_TAB_ID;

	beforeEach(() => {
		delete (globalThis as Record<string, unknown>)
			.__supersetOpencodeNotifyPluginV9;
		process.env.SUPERSET_TAB_ID = "tab-test";
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>)
			.__supersetOpencodeNotifyPluginV9;
		if (originalTabId === undefined) {
			delete process.env.SUPERSET_TAB_ID;
		} else {
			process.env.SUPERSET_TAB_ID = originalTabId;
		}
	});

	test("sends PermissionRequest when opencode publishes permission.asked bus event", async () => {
		const SupersetNotifyPlugin = await loadPlugin();
		const { $, client, notifyCalls } = createMocks();
		const plugin = (await SupersetNotifyPlugin({ $, client })) as {
			event: (payload: {
				event: {
					type: string;
					properties: Record<string, unknown>;
				};
			}) => Promise<void>;
		};

		// Mark the session as busy first so the plugin adopts it as the root
		// session (mirrors opencode's real lifecycle).
		await plugin.event({
			event: {
				type: "session.status",
				properties: {
					sessionID: "sess-root",
					status: { type: "busy" },
				},
			},
		});
		notifyCalls.length = 0;

		// opencode publishes permission.asked on its bus when the agent needs
		// approval to run a tool or to ask the user a question. This is the
		// event the Superset plugin must surface as a notification.
		await plugin.event({
			event: {
				type: "permission.asked",
				properties: {
					id: "perm-1",
					sessionID: "sess-root",
					permission: "bash",
					patterns: ["ls"],
					metadata: {},
					always: [],
				},
			},
		});

		expect(notifyCalls.some((c) => c.includes("PermissionRequest"))).toBe(true);
	});

	test("sends PermissionRequest when opencode asks a question (permission.asked with permission=question)", async () => {
		const SupersetNotifyPlugin = await loadPlugin();
		const { $, client, notifyCalls } = createMocks();
		const plugin = (await SupersetNotifyPlugin({ $, client })) as {
			event: (payload: {
				event: {
					type: string;
					properties: Record<string, unknown>;
				};
			}) => Promise<void>;
		};

		await plugin.event({
			event: {
				type: "session.status",
				properties: {
					sessionID: "sess-root",
					status: { type: "busy" },
				},
			},
		});
		notifyCalls.length = 0;

		// Opencode's `opencode run` models questions as permissions with
		// permission: "question" (see packages/opencode/src/cli/cmd/run.ts).
		await plugin.event({
			event: {
				type: "permission.asked",
				properties: {
					id: "perm-2",
					sessionID: "sess-root",
					permission: "question",
					patterns: ["*"],
					metadata: {},
					always: [],
				},
			},
		});

		expect(notifyCalls.some((c) => c.includes("PermissionRequest"))).toBe(true);
	});
});
