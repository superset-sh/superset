/**
 * Provisions one real sandbox through the same function the API uses, then
 * checks what a workspace needs from it: host-service answering only to the
 * token signed for this workspace, the repo cloned on the requested branch,
 * and the desktop pane's VNC endpoint completing an RFB handshake through
 * host-service's authenticated proxy. Deletes the sandbox afterwards, pass or
 * fail.
 *
 *   bun run sandbox:smoke              # from the repo root; reads .env
 *   bun run sandbox:smoke -- --keep    # leave the sandbox up for poking at
 *   SMOKE_SOURCE_KIND=fork SMOKE_SOURCE_REF=env-internal-… bun run sandbox:smoke
 *                                      # provision from a golden, as the internal
 *                                      # environment does; also checks dependencies
 *
 * Skips the API's own wrapper on purpose: the workspace row, the QStash
 * delivery and the GitHub App token mint. The mint needs the production App
 * key, so locally the clone is unauthenticated — fine for a public repo.
 */
import {
	SANDBOX_HOST_DB_PATH,
	SANDBOX_IMAGE_NAME,
	SANDBOX_WORKSPACE_PATH,
} from "@superset/shared/constants";
import { Sandbox } from "@vercel/sandbox";
import { env } from "../src/env";
import {
	deleteSandbox,
	mintSandboxAccessToken,
	provisionSandbox,
	resolveSandboxAddress,
	sandboxAccessVerifier,
} from "../src/lib/sandbox";

const REPO_URL = "https://github.com/superset-sh/superset.git";
const BRANCH = process.env.SMOKE_BRANCH ?? "main";
const KEEP = process.argv.includes("--keep");
const SOURCE_KIND = process.env.SMOKE_SOURCE_KIND === "fork" ? "fork" : "image";
const SOURCE_REF = process.env.SMOKE_SOURCE_REF ?? SANDBOX_IMAGE_NAME;
const HEALTH_ATTEMPTS = 40;
const VNC_TIMEOUT_MS = 30_000;

const name = `ws-smoke-${Math.random().toString(36).slice(2, 10)}`;
const workspaceId = process.env.SMOKE_WORKSPACE_ID ?? crypto.randomUUID();
const started = Date.now();
const at = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const failures: string[] = [];
function check(label: string, ok: boolean, detail: string) {
	console.log(`${at()} ${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
	if (!ok) failures.push(label);
}

async function status(
	url: string,
	path: string,
	token?: string,
): Promise<number> {
	try {
		return (
			await fetch(`${url}${path}`, {
				headers: token ? { authorization: `Bearer ${token}` } : {},
			})
		).status;
	} catch {
		return 0;
	}
}

/**
 * health.check is deliberately public (it is how a client tells a booting
 * sandbox from a dead one), so the gate is probed on a guarded route: the
 * event socket answers 401 to anything but a valid token, and a plain GET
 * with one gets past the guard to the route's own refusal to serve non-upgrades.
 */
const GUARDED = "/events";

async function firstVncFrame(url: URL): Promise<string> {
	return new Promise((resolve) => {
		const ws = new WebSocket(url.toString());
		ws.binaryType = "arraybuffer";
		const timer = setTimeout(() => {
			resolve("timeout");
			ws.close();
		}, VNC_TIMEOUT_MS);
		ws.onmessage = (event) => {
			clearTimeout(timer);
			const bytes = new Uint8Array(event.data as ArrayBuffer).slice(0, 12);
			resolve(new TextDecoder().decode(bytes));
			ws.close();
		};
		ws.onclose = (event) => {
			clearTimeout(timer);
			resolve(`closed ${event.code} ${event.reason}`);
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve("error");
		};
	});
}

async function inside(command: string): Promise<string> {
	const sandbox = await Sandbox.get({
		token: env.VERCEL_SANDBOX_TOKEN,
		teamId: env.VERCEL_SANDBOX_TEAM_ID,
		projectId: env.VERCEL_SANDBOX_PROJECT_ID,
		name,
	});
	const result = await sandbox.runCommand("bash", ["-lc", command]);
	return `${await result.stdout()}${await result.stderr()}`;
}

try {
	const sandbox = await provisionSandbox({
		name,
		environment: { sourceKind: SOURCE_KIND, sourceRef: SOURCE_REF },
		workspaceEnv: {
			ORGANIZATION_ID: "00000000-0000-0000-0000-000000000000",
			HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
			HOST_MIGRATIONS_FOLDER: "/app/drizzle",
			AUTH_TOKEN: "sandbox",
			SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
			SUPERSET_HOST_RUN_MODE: "sandbox",
			SUPERSET_SANDBOX_WORKSPACE_ID: workspaceId,
			SUPERSET_SANDBOX_ACCESS_PUBLIC_KEY: sandboxAccessVerifier(),
			SUPERSET_SANDBOX_WORKSPACE_NAME: "smoke",
			SUPERSET_SANDBOX_BRANCH: BRANCH,
			SUPERSET_SANDBOX_WORKSPACE_PATH: SANDBOX_WORKSPACE_PATH,
			SUPERSET_SANDBOX_REPO_URL: REPO_URL,
			SUPERSET_SANDBOX_IMAGE_TAG: SOURCE_REF,
			SUPERSET_SANDBOX_PROVIDER: "vercel",
		},
	});
	console.log(`${at()} provisioned ${sandbox.providerSandboxId}`);

	const url = await resolveSandboxAddress({
		providerSandboxId: name,
		wake: false,
	});
	const { token } = mintSandboxAccessToken(workspaceId);
	if (KEEP) console.log(`${at()} url ${url}`);

	let health = 0;
	for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt++) {
		health = await status(url, "/trpc/health.check", token);
		if (health === 200) break;
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	check("host-service", health === 200, `health.check ${health}`);

	// The sandbox's URL is public; host-service is the only gate.
	const noToken = await status(url, GUARDED);
	check("no token refused", noToken === 401, `${noToken} (expect 401)`);
	const otherWorkspace = await status(
		url,
		GUARDED,
		mintSandboxAccessToken(crypto.randomUUID()).token,
	);
	check(
		"other workspace's token refused",
		otherWorkspace === 401,
		`${otherWorkspace} (expect 401)`,
	);
	const forged = await status(url, GUARDED, `${token.slice(0, -4)}AAAA`);
	check("forged token refused", forged === 401, `${forged} (expect 401)`);
	const valid = await status(url, GUARDED, token);
	check("valid token admitted", valid !== 401, `${valid} (expect not 401)`);
	// The desktop renderer is a browser; without this every call fails preflight.
	const preflight = await fetch(`${url}/trpc/health.check`, {
		method: "OPTIONS",
		headers: {
			origin: "http://localhost:5173",
			"access-control-request-method": "POST",
			"access-control-request-headers": "authorization",
		},
	}).catch(() => null);
	check(
		"cors preflight",
		preflight?.headers.get("access-control-allow-origin") === "*",
		`allow-origin ${preflight?.headers.get("access-control-allow-origin") ?? "(none)"}`,
	);

	const branch = await inside(
		`git -C ${SANDBOX_WORKSPACE_PATH} rev-parse --abbrev-ref HEAD`,
	);
	check("branch", branch.trim() === BRANCH, branch.trim() || "(no output)");
	if (SOURCE_KIND === "fork") {
		const deps = await inside(
			`test -d ${SANDBOX_WORKSPACE_PATH}/node_modules && echo ok`,
		);
		check("dependencies survive the fork", deps.includes("ok"), deps.trim());
	}
	const identity = await inside(
		'id -u; node -e \'require("/app/node_modules/better-sqlite3"); require("/app/node_modules/node-pty"); console.log("natives ok")\'',
	);
	check(
		"runs as root with the natives loading",
		/^0\nnatives ok/m.test(identity),
		identity.trim().replace(/\n/g, " / "),
	);
	const placeholder = await inside(
		"cat /proc/$(pgrep -f 'node host-service.js' | head -1)/environ | tr '\\0' '\\n' | grep -c '^ANTHROPIC_API_KEY=proxy-injected'",
	);
	check(
		"organization key brokered, not in the box",
		placeholder.trim() === "1",
		`placeholder present ${placeholder.trim()}`,
	);

	const brokered = await inside(
		"curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H \"x-api-key: $ANTHROPIC_API_KEY\" -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models",
	);
	check(
		"anthropic reachable through the brokered key",
		brokered.trim() === "200",
		`models ${brokered.trim()}`,
	);

	const vnc = new URL("/desktop/vnc", url);
	vnc.protocol = "wss:";
	vnc.searchParams.set("token", token);
	const frame = await firstVncFrame(vnc);
	check("vnc", frame.startsWith("RFB "), JSON.stringify(frame));
} catch (error) {
	check("run", false, error instanceof Error ? error.message : String(error));
} finally {
	if (KEEP) {
		console.log(`${at()} kept ${name}`);
	} else {
		await deleteSandbox(name).catch((error) =>
			console.error(`${at()} teardown failed for ${name}`, error),
		);
		console.log(`${at()} deleted ${name}`);
	}
}

if (failures.length) {
	console.error(
		`${at()} ${failures.length} check(s) failed: ${failures.join(", ")}`,
	);
	process.exit(1);
}
console.log(`${at()} all checks passed`);
