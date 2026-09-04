/**
 * Provisions one real sandbox through the same function the API uses, then
 * checks what a workspace needs from it: host-service answering, the repo
 * cloned on the requested branch, and the desktop pane's VNC endpoint
 * completing an RFB handshake through host-service's authenticated proxy.
 * Deletes the sandbox afterwards, pass or fail.
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
import { SandboxInstance } from "@blaxel/core";
import {
	SANDBOX_HOST_DB_PATH,
	SANDBOX_IMAGE_NAME,
	SANDBOX_WORKSPACE_PATH,
} from "@superset/shared/constants";
import {
	deleteSandbox,
	mintPreviewAccess,
	provisionSandbox,
} from "../src/lib/blaxel";

const REPO_URL = "https://github.com/superset-sh/superset.git";
const BRANCH = process.env.SMOKE_BRANCH ?? "main";
const KEEP = process.argv.includes("--keep");
const SOURCE_KIND = process.env.SMOKE_SOURCE_KIND === "fork" ? "fork" : "image";
const SOURCE_REF = process.env.SMOKE_SOURCE_REF ?? SANDBOX_IMAGE_NAME;
const HEALTH_ATTEMPTS = 40;
const VNC_TIMEOUT_MS = 30_000;

const name = `ws-smoke-${Math.random().toString(36).slice(2, 10)}`;
const started = Date.now();
const at = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const failures: string[] = [];
function check(label: string, ok: boolean, detail: string) {
	console.log(`${at()} ${ok ? "ok  " : "FAIL"} ${label}: ${detail}`);
	if (!ok) failures.push(label);
}

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

try {
	const sandbox = await provisionSandbox({
		name,
		environment: {
			id: "smoke",
			provider: "blaxel",
			sourceKind: SOURCE_KIND,
			sourceRef: SOURCE_REF,
			envs: {},
		},
		workspaceEnv: {
			ORGANIZATION_ID: "00000000-0000-0000-0000-000000000000",
			HOST_DB_PATH: SANDBOX_HOST_DB_PATH,
			HOST_MIGRATIONS_FOLDER: "/app/drizzle",
			AUTH_TOKEN: "sandbox",
			SUPERSET_API_URL:
				process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
			SUPERSET_HOST_RUN_MODE: "sandbox",
			SUPERSET_SANDBOX_WORKSPACE_ID:
				process.env.SMOKE_WORKSPACE_ID ?? crypto.randomUUID(),
			SUPERSET_SANDBOX_WORKSPACE_NAME: "smoke",
			SUPERSET_SANDBOX_BRANCH: BRANCH,
			SUPERSET_SANDBOX_WORKSPACE_PATH: SANDBOX_WORKSPACE_PATH,
			SUPERSET_SANDBOX_REPO_URL: REPO_URL,
			SUPERSET_SANDBOX_IMAGE_TAG: SANDBOX_IMAGE_NAME,
		},
	});
	console.log(`${at()} provisioned ${sandbox.providerSandboxId}`);

	const access = await mintPreviewAccess(name);
	if (KEEP) console.log(`${at()} preview ${access.url}`);
	const headers = {
		"X-Blaxel-Preview-Token": access.token,
		authorization: "Bearer sandbox",
	};

	let health = 0;
	for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt++) {
		try {
			health = (await fetch(`${access.url}/trpc/health.check`, { headers }))
				.status;
			if (health === 200) break;
		} catch {
			health = 0;
		}
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	check("host-service", health === 200, `health.check ${health}`);

	const instance = await SandboxInstance.get(name);
	const inspect = [
		`git -C ${SANDBOX_WORKSPACE_PATH} remote get-url origin`,
		`git -C ${SANDBOX_WORKSPACE_PATH} rev-parse --abbrev-ref HEAD`,
		"test -f /data/.workspace-bootstrapped && echo bootstrapped",
		`test -d ${SANDBOX_WORKSPACE_PATH}/node_modules && echo deps`,
		"pgrep -x Xvfb >/dev/null && echo xvfb",
		"pgrep -x x11vnc >/dev/null && echo x11vnc",
	].join("; ");
	await instance.process.exec({
		name: "smoke-inspect",
		command: `bash -lc ${JSON.stringify(inspect)}`,
		waitForCompletion: true,
	} as never);
	const lines = String(await instance.process.logs("smoke-inspect"))
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	check("repo", lines[0] === REPO_URL, lines[0] ?? "(no origin)");
	check("branch", lines[1] === BRANCH, lines[1] ?? "(none)");
	check("bootstrap", lines.includes("bootstrapped"), "marker present");
	if (SOURCE_KIND === "fork")
		check("dependencies", lines.includes("deps"), "node_modules present");
	else
		console.log(
			`${at()} info dependencies: ${lines.includes("deps") ? "present" : "absent (base image bakes none)"}`,
		);
	check(
		"display",
		lines.includes("xvfb") && lines.includes("x11vnc"),
		lines.slice(3).join(" "),
	);

	const vnc = new URL("/desktop/vnc", access.url);
	vnc.protocol = vnc.protocol === "https:" ? "wss:" : "ws:";
	vnc.searchParams.set("bl_preview_token", access.token);
	vnc.searchParams.set("token", "sandbox");
	const frame = await firstVncFrame(vnc);
	check("vnc", frame.startsWith("RFB "), JSON.stringify(frame));
} catch (error) {
	failures.push("provision");
	console.log(`${at()} FAIL provision: ${String(error).slice(0, 400)}`);
} finally {
	if (KEEP) console.log(`${at()} kept ${name}`);
	else
		await deleteSandbox(name)
			.then(() => console.log(`${at()} deleted ${name}`))
			.catch((error) =>
				console.log(`${at()} delete failed: ${String(error).slice(0, 200)}`),
			);
}

if (failures.length) {
	console.log(`FAILED: ${failures.join(", ")}`);
	process.exit(1);
}
console.log("PASS");
process.exit(0);
