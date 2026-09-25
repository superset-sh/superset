// Per-agent hook-chain verification against a live host-service.
//
// For each of the 13 supported agents, dispatch a lifecycle event through the
// agent's OWN provisioned artifact — the command registered in its global
// config (claude/codex/droid/mastracode/kimi/grok/vibe), its dedicated hook
// script (cursor-agent/gemini/copilot), or its plugin imported into a stub
// runtime (opencode/amp/pi) — and assert the binding row lands in
// terminal_agent_bindings with the right agent id, session id, and event.
//
// Runs under bun (bun:sqlite + TS plugin imports). Invoked by
// headless-e2e.sh against the E2E's sandboxed $HOME and live host; payload
// shapes mirror each agent's real wire format (codex thread-id envelope,
// grok camelCase, opencode status.type objects, cursor argv events, ...).
//
// Usage: bun agents-hook-matrix.ts <home> <hostPort> <hostDbPath>
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

const [HOME, PORT, DB_PATH] = [
	process.argv[2],
	process.argv[3],
	process.argv[4],
];
if (!HOME || !PORT || !DB_PATH) throw new Error("usage: <home> <port> <db>");
const SS_HOME = path.join(HOME, ".superset");
const HOOK_URL = `http://127.0.0.1:${PORT}/trpc/notifications.hook`;
const db = new Database(DB_PATH);
const AGENTS = [
	"amp",
	"claude",
	"codex",
	"droid",
	"opencode",
	"pi",
	"cursor-agent",
	"gemini",
	"mastracode",
	"kimi",
	"grok",
	"copilot",
	"vibe",
];

// One workspace + one terminal per agent.
db.query(
	"insert or ignore into workspaces (id, worktree_path, branch, type, created_at, updated_at) values (?,?,?,?,?,?)",
).run("ws-agents", "/tmp/ws-agents", "main", "worktree", Date.now(), 0);
for (const a of AGENTS) {
	db.query(
		"insert or ignore into terminal_sessions (id, origin_workspace_id, status, created_at) values (?,?,?,?)",
	).run(`term-${a}`, "ws-agents", "active", Date.now());
}

function baseEnv(
	agent: string,
	extra: Record<string, string> = {},
): Record<string, string | undefined> {
	return {
		...process.env,
		HOME,
		SUPERSET_HOME_DIR: SS_HOME,
		SUPERSET_TERMINAL_ID: `term-${agent}`,
		SUPERSET_HOST_AGENT_HOOK_URL: HOOK_URL,
		SUPERSET_DEBUG_HOOKS: "1",
		...extra,
	};
}

function sh(
	cmd: string,
	opts: {
		agent: string;
		stdin?: string;
		argv?: string[];
		env?: Record<string, string>;
	},
) {
	const proc = Bun.spawnSync(
		[
			"bash",
			"-c",
			`${cmd}${opts.argv ? "" : ""}`,
			"hook",
			...(opts.argv ?? []),
		],
		{
			env: baseEnv(opts.agent, opts.env),
			stdin: Buffer.from(opts.stdin ?? ""),
		},
	);
	return {
		out: proc.stdout.toString() + proc.stderr.toString(),
		code: proc.exitCode,
	};
}

function runScript(
	script: string,
	opts: {
		agent: string;
		stdin?: string;
		argv?: string[];
		env?: Record<string, string>;
	},
) {
	const proc = Bun.spawnSync(["bash", script, ...(opts.argv ?? [])], {
		env: baseEnv(opts.agent, opts.env),
		stdin: Buffer.from(opts.stdin ?? ""),
	});
	return {
		out: proc.stdout.toString() + proc.stderr.toString(),
		code: proc.exitCode,
	};
}

/** Pull the registered Superset command out of a nested-hooks JSON file. */
function commandFromJson(file: string, eventKey: string): string {
	const root = JSON.parse(fs.readFileSync(file, "utf-8"));
	const container = root.hooks ?? root;
	const entries = container[eventKey];
	for (const entry of entries ?? []) {
		if (entry.command?.includes("hooks/notify.sh")) return entry.command;
		for (const h of entry.hooks ?? []) {
			if (h.command?.includes("hooks/notify.sh")) return h.command;
		}
	}
	throw new Error(`no managed command for ${eventKey} in ${file}`);
}

/** Pull the first managed command out of a TOML managed block. */
function commandFromToml(file: string): string {
	const text = fs.readFileSync(file, "utf-8");
	const m = text.match(/command = '([^']+notify\.sh[^']*)'/)?.[1];
	if (!m) throw new Error(`no managed command in ${file}`);
	return m;
}

function binding(agent: string) {
	return db
		.query(
			"select agent_id, agent_session_id, last_event_type, end_reason from terminal_agent_bindings where terminal_id = ?",
		)
		.get(`term-${agent}`) as {
		agent_id: string;
		agent_session_id: string | null;
		last_event_type: string;
		end_reason: string | null;
	} | null;
}

const results: Array<{
	agent: string;
	via: string;
	ok: boolean;
	detail: string;
}> = [];
function assertBinding(
	agent: string,
	via: string,
	wantEvent: string,
	wantSession?: string,
) {
	const row = binding(agent);
	const ok =
		!!row &&
		row.agent_id === agent &&
		row.last_event_type === wantEvent &&
		(wantSession === undefined || row.agent_session_id === wantSession) &&
		row.end_reason === null;
	results.push({ agent, via, ok, detail: JSON.stringify(row) });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function assertBindingEventually(
	agent: string,
	via: string,
	wantEvent: string,
	wantSession?: string,
) {
	for (let i = 0; i < 20; i++) {
		const row = binding(agent);
		if (
			row &&
			row.agent_id === agent &&
			row.last_event_type === wantEvent &&
			(wantSession === undefined || row.agent_session_id === wantSession) &&
			row.end_reason === null
		) {
			results.push({ agent, via, ok: true, detail: "" });
			return;
		}
		await sleep(300);
	}
	results.push({
		agent,
		via,
		ok: false,
		detail: JSON.stringify(binding(agent)),
	});
}

// ── Config-command agents (payload schemas differ per agent) ─────────────
const claudeStyle = (sid: string) =>
	JSON.stringify({ hook_event_name: "Stop", session_id: sid });

const cmdClaude = commandFromJson(
	path.join(HOME, ".claude/settings.json"),
	"Stop",
);
sh(cmdClaude, { agent: "claude", stdin: claudeStyle("s-claude") });
assertBinding("claude", "~/.claude/settings.json command", "Stop", "s-claude");

const cmdCodex = commandFromJson(path.join(HOME, ".codex/hooks.json"), "Stop");
sh(cmdCodex, {
	agent: "codex",
	stdin: JSON.stringify({
		type: "agent-turn-complete",
		"thread-id": "th-codex",
	}),
});
assertBinding("codex", "~/.codex/hooks.json command", "Stop", "th-codex");

const cmdDroid = commandFromJson(
	path.join(HOME, ".factory/settings.json"),
	"Stop",
);
sh(cmdDroid, { agent: "droid", stdin: claudeStyle("s-droid") });
assertBinding("droid", "~/.factory/settings.json command", "Stop", "s-droid");

const cmdMastra = commandFromJson(
	path.join(HOME, ".mastracode/hooks.json"),
	"Stop",
);
sh(cmdMastra, { agent: "mastracode", stdin: claudeStyle("s-mastra") });
assertBinding(
	"mastracode",
	"~/.mastracode/hooks.json command",
	"Stop",
	"s-mastra",
);

const cmdKimi = commandFromToml(path.join(HOME, ".kimi-code/config.toml"));
sh(cmdKimi, { agent: "kimi", stdin: claudeStyle("s-kimi") });
assertBinding("kimi", "~/.kimi-code/config.toml command", "Stop", "s-kimi");

const grokFile = path.join(HOME, ".grok/hooks/superset-notify.json");
const grokRoot = JSON.parse(fs.readFileSync(grokFile, "utf-8"));
const grokEventKey = Object.keys(grokRoot.hooks ?? grokRoot)[0];
if (!grokEventKey) throw new Error(`no events in ${grokFile}`);
const cmdGrok = commandFromJson(grokFile, grokEventKey);
sh(cmdGrok, {
	agent: "grok",
	stdin: JSON.stringify({ hookEventName: "Stop", sessionId: "s-grok" }),
});
assertBinding(
	"grok",
	"~/.grok/hooks/superset-notify.json (camelCase)",
	"Stop",
	"s-grok",
);
sh(cmdGrok, {
	agent: "grok",
	stdin: JSON.stringify({
		hookEventName: "notification",
		notificationType: "permission_prompt",
		sessionId: "s-grok",
	}),
});
{
	const row = binding("grok");
	results.push({
		agent: "grok",
		via: "grok permission_prompt → PermissionRequest",
		ok: row?.last_event_type === "PermissionRequest",
		detail: JSON.stringify(row),
	});
}

const cmdVibe = commandFromToml(path.join(HOME, ".vibe/hooks.toml"));
sh(cmdVibe, { agent: "vibe", stdin: claudeStyle("s-vibe") });
assertBinding("vibe", "~/.vibe/hooks.toml command", "Stop", "s-vibe");

// ── Dedicated hook-script agents ─────────────────────────────────────────
const cursorScript = path.join(SS_HOME, "hooks", "cursor-hook.sh");
const perm = runScript(cursorScript, {
	agent: "cursor-agent",
	argv: ["PermissionRequest"],
	stdin: JSON.stringify({ session_id: "s-cursor" }),
	env: { SUPERSET_AGENT_ID: "cursor-agent" },
});
results.push({
	agent: "cursor-agent",
	via: "cursor-hook.sh auto-approve",
	ok: perm.out.includes('{"continue":true}'),
	detail: perm.out.slice(0, 80),
});
runScript(cursorScript, {
	agent: "cursor-agent",
	argv: ["Stop"],
	stdin: JSON.stringify({ session_id: "s-cursor" }),
	env: { SUPERSET_AGENT_ID: "cursor-agent" },
});
assertBinding("cursor-agent", "cursor-hook.sh argv=Stop", "Stop", "s-cursor");

runScript(path.join(SS_HOME, "hooks", "gemini-hook.sh"), {
	agent: "gemini",
	stdin: JSON.stringify({
		hook_event_name: "AfterAgent",
		session_id: "s-gemini",
	}),
	env: { SUPERSET_AGENT_ID: "gemini" },
});
assertBinding("gemini", "gemini-hook.sh AfterAgent → Stop", "Stop", "s-gemini");

runScript(path.join(SS_HOME, "hooks", "copilot-hook.sh"), {
	agent: "copilot",
	argv: ["userPromptSubmitted"],
	stdin: JSON.stringify({ session_id: "s-copilot" }),
	env: { SUPERSET_AGENT_ID: "copilot" },
});
assertBinding(
	"copilot",
	"copilot-hook.sh userPromptSubmitted → Start",
	"Start",
	"s-copilot",
);

// ── Plugin agents: import the provisioned artifact into a stub runtime ───
async function withAgentEnv(
	agent: string,
	extra: Record<string, string>,
	fn: () => Promise<void>,
) {
	const saved: Record<string, string | undefined> = {};
	const wanted = baseEnv(agent, extra);
	const keys = new Set([
		"HOME",
		"SUPERSET_HOME_DIR",
		"SUPERSET_TERMINAL_ID",
		"SUPERSET_HOST_AGENT_HOOK_URL",
		"SUPERSET_DEBUG_HOOKS",
		"SUPERSET_AGENT_ID",
		...Object.keys(extra),
	]);
	for (const k of keys) {
		saved[k] = process.env[k];
		if (wanted[k] !== undefined) process.env[k] = wanted[k] as string;
	}
	try {
		await fn();
	} finally {
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}
}

// opencode: provisioned plugin returns an { event } handler; $ is a shell tag.
await withAgentEnv(
	"opencode",
	{ SUPERSET_AGENT_ID: "opencode", SUPERSET_DEBUG: "1" },
	async () => {
		const mod = await import(
			path.join(SS_HOME, "hooks", "opencode", "plugin", "superset-notify.js")
		);
		const $ = (_strings: TemplateStringsArray, ...vals: unknown[]) => {
			Bun.spawnSync(["bash", String(vals[0]), String(vals[1])], {
				env: { ...process.env },
			});
			const res = Promise.resolve({ exitCode: 0, text: async () => "" });
			(res as any).quiet = () => res;
			return res;
		};
		const client = {
			session: {
				list: async () => ({ data: [{ id: "s-oc", parentID: undefined }] }),
			},
		};
		const hooks = await mod.SupersetNotifyPlugin({ $, client });
		if (typeof hooks.event !== "function")
			throw new Error(
				`opencode plugin returned no event handler: ${Object.keys(hooks)}`,
			);
		await hooks.event({
			event: {
				type: "session.status",
				properties: { status: { type: "busy" }, info: { id: "s-oc" } },
			},
		});
		await sleep(800);
		await hooks.event({
			event: {
				type: "session.status",
				properties: { status: { type: "idle" }, info: { id: "s-oc" } },
			},
		});
	},
);
await assertBindingEventually(
	"opencode",
	"opencode plugin busy→idle → Stop",
	"Stop",
);

// amp: default export registers amp.on handlers; notify spawns detached.
await withAgentEnv("amp", {}, async () => {
	const mod = await import(
		path.join(HOME, ".config", "amp", "plugins", "superset-lifecycle.ts")
	);
	const handlers = new Map<string, (e?: unknown) => unknown>();
	mod.default({
		on: (name: string, fn: (e?: unknown) => unknown) => handlers.set(name, fn),
	});
	if (!handlers.has("agent.end"))
		throw new Error(`amp plugin registered: ${[...handlers.keys()].join(",")}`);
	await handlers.get("agent.start")?.({ threadID: "s-amp" });
	await sleep(1000);
	await handlers.get("agent.end")?.({ threadID: "s-amp" });
});
await assertBindingEventually(
	"amp",
	"amp plugin agent.end → Stop",
	"Stop",
	"s-amp",
);

// pi: default export registers pi.on handlers gated on ctx.hasUI.
await withAgentEnv("pi", {}, async () => {
	const mod = await import(
		path.join(HOME, ".pi", "agent", "extensions", "superset-hooks.ts")
	);
	const handlers = new Map<string, (e: unknown, ctx: unknown) => unknown>();
	mod.default({
		on: (name: string, fn: (e: unknown, ctx: unknown) => unknown) =>
			handlers.set(name, fn),
	});
	if (!handlers.has("agent_end"))
		throw new Error(
			`pi extension registered: ${[...handlers.keys()].join(",")}`,
		);
	await handlers.get("before_agent_start")?.({}, { hasUI: true });
	await sleep(1000);
	await handlers.get("agent_end")?.({}, { hasUI: true });
});
await assertBindingEventually("pi", "pi extension agent_end → Stop", "Stop");

// ── Report ────────────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
	if (!r.ok) failed++;
	console.log(
		`${r.ok ? "PASS" : "FAIL"}  ${r.agent.padEnd(13)} via ${r.via}  ${r.ok ? "" : r.detail}`,
	);
}
const covered = new Set(results.filter((r) => r.ok).map((r) => r.agent));
const missing = AGENTS.filter((a) => !covered.has(a));
if (missing.length) {
	console.log("MISSING AGENTS:", missing.join(", "));
	failed++;
}
console.log(
	failed === 0 ? "ALL 13 AGENTS: HOOK CHAIN VERIFIED" : `FAILURES: ${failed}`,
);
process.exit(failed === 0 ? 0 : 1);
