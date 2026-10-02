import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAcpAdapter } from "@superset/chat-runtime";

const require = createRequire(import.meta.url);
const pkg = require.resolve(
	"@agentclientprotocol/claude-agent-acp/package.json",
);
const entry = join(dirname(pkg), "dist/index.js");
const cwd = mkdtempSync(join(tmpdir(), "acp-smoke-"));

const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" } as NodeJS.ProcessEnv;
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;

console.log(`[smoke] entry=${entry}`);
console.log(`[smoke] cwd=${cwd}`);

const adapter = createAcpAdapter({ command: "node", args: [entry], cwd, env });

let done = false;
const deadline = setTimeout(() => {
	console.log("[smoke] TIMEOUT after 90s");
	void adapter.dispose().then(() => process.exit(done ? 0 : 2));
}, 90_000);

let prompted = false;
async function run() {
	for await (const event of adapter.start({ cwd })) {
		if (event.kind === "session") {
			console.log(`[session] ${JSON.stringify(event.session)}`);
			if (event.session.status === "idle" && !prompted) {
				prompted = true;
				console.log("[smoke] prompting…");
				adapter.prompt([
					{ type: "text", text: "Reply with exactly one word: PONG" },
				]);
			}
		} else if (event.kind === "item") {
			const item = event.item;
			if (item.kind === "agent_message") console.log(`[agent] ${item.text}`);
			else if (item.kind === "notice")
				console.log(`[notice:${item.noticeKind}] ${item.text ?? ""}`);
			else if (item.kind === "tool_call")
				console.log(`[tool] ${item.title} (${item.status})`);
			else console.log(`[item:${item.kind}]`);
		} else if (event.kind === "turn") {
			console.log(`[turn] ${event.turn.status}`);
			if (event.turn.status === "completed" || event.turn.status === "failed") {
				done = event.turn.status === "completed";
				clearTimeout(deadline);
				console.log(`[smoke] ${done ? "PASS" : "FAIL"} — disposing`);
				await adapter.dispose();
				process.exit(done ? 0 : 1);
			}
		}
	}
}

void run();
