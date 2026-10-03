import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const run = promisify(execFile);

export type MobileBackend = "limrun" | "local-ios" | "local-android" | "none";

async function commandExists(cmd: string): Promise<boolean> {
	try {
		await run("which", [cmd]);
		return true;
	} catch {
		return false;
	}
}

/** What this host can show a mobile pane with: a sandbox always prefers
 * Limrun (no local toolchain at all); a real machine prefers whichever
 * local toolchain is installed. */
export async function detectMobileBackend(): Promise<MobileBackend> {
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") {
		return process.env.LIM_API_KEY ? "limrun" : "none";
	}
	if (process.platform === "darwin" && (await commandExists("xcrun"))) {
		try {
			await run("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
			return "local-ios";
		} catch {
			// No Simulator.app/booted device yet; fall through to Android.
		}
	}
	if (await commandExists("adb")) {
		return "local-android";
	}
	return "none";
}

interface LimrunStatus {
	endpointWebSocketUrl?: string;
	token?: string;
}
interface LimrunInstance {
	status?: LimrunStatus;
}

/** Mints or reuses a Limrun instance and returns just enough for
 * `<RemoteControl />`: the org-wide LIM_API_KEY never leaves this process. */
async function createLimrunSession(platform: "ios" | "android") {
	const apiKey = process.env.LIM_API_KEY;
	if (!apiKey) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "LIM_API_KEY is not set on this sandbox",
		});
	}
	const workspaceId = process.env.SUPERSET_SANDBOX_WORKSPACE_ID ?? "local";
	const resource = platform === "ios" ? "ios_instances" : "android_instances";
	const response = await fetch(
		`https://api.limrun.com/v1/${resource}?wait=true&reuseIfExists=true`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				metadata: { labels: { "superset-workspace": workspaceId } },
			}),
		},
	);
	if (!response.ok) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Limrun ${resource} create failed (${response.status}): ${await response.text()}`,
		});
	}
	const instance = (await response.json()) as LimrunInstance;
	const { endpointWebSocketUrl, token } = instance.status ?? {};
	if (!endpointWebSocketUrl || !token) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Limrun instance has no endpointWebSocketUrl/token yet",
		});
	}
	return { endpointWebSocketUrl, token, platform };
}

/** An OS-assigned free port, so two workspaces on one machine never collide. */
async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const { port } = address;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("could not allocate a port")));
			}
		});
	});
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok || response.status < 500) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Nothing answered ${url} within ${timeoutMs}ms`,
	});
}

interface LocalServer {
	child: ChildProcess;
	port: number;
	platform: "local-ios" | "local-android";
}

/** One local mirroring process per host-service, reused across pane remounts.
 * Not persisted: a host-service restart starts fresh, like its other processes. */
let localServer: LocalServer | null = null;

/** `@expo/serve-sim` (github.com/expo/serve-sim): captures a booted iOS
 * Simulator and serves a browser-embeddable preview UI. Apple Silicon + Xcode only. */
async function ensureLocalIosServer(): Promise<{ port: number }> {
	if (localServer?.platform === "local-ios") return { port: localServer.port };
	stopLocalServer();
	const port = await getFreePort();
	const child = spawn(
		"npx",
		["--yes", "@expo/serve-sim", "--port", String(port), "--quiet"],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	localServer = { child, port, platform: "local-ios" };
	child.on("exit", () => {
		if (localServer?.child === child) localServer = null;
	});
	await waitForHttp(`http://127.0.0.1:${port}`, 20_000);
	return { port };
}

/** Android has no serve-sim equivalent (scrcpy renders to a native window, not
 * a browser); `SUPERSET_ANDROID_MIRROR_CMD` lets whoever tests this on real
 * hardware configure a browser-embeddable tool (e.g. a ws-scrcpy fork) without
 * a code change — no default, since shipping one would claim untested confidence. */
async function ensureLocalAndroidServer(): Promise<{ port: number }> {
	if (localServer?.platform === "local-android") {
		return { port: localServer.port };
	}
	const command = process.env.SUPERSET_ANDROID_MIRROR_CMD;
	if (!command) {
		throw new TRPCError({
			code: "NOT_IMPLEMENTED",
			message:
				"No Android screen-mirroring server configured. Set SUPERSET_ANDROID_MIRROR_CMD to a command that serves a browser-embeddable view (e.g. a ws-scrcpy fork) on the port passed as its last argument.",
		});
	}
	stopLocalServer();
	const port = await getFreePort();
	const [cmd, ...args] = command.split(" ");
	if (!cmd) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "SUPERSET_ANDROID_MIRROR_CMD is empty",
		});
	}
	const child = spawn(cmd, [...args, String(port)], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	localServer = { child, port, platform: "local-android" };
	child.on("exit", () => {
		if (localServer?.child === child) localServer = null;
	});
	await waitForHttp(`http://127.0.0.1:${port}`, 20_000);
	return { port };
}

function stopLocalServer(): void {
	if (!localServer) return;
	localServer.child.kill();
	localServer = null;
}

export const mobileRouter = router({
	/** What this host can show a mobile pane with, resolved once per call —
	 * cheap (a `which` and maybe one `xcrun` call), so no caching. */
	status: protectedProcedure.query(async () => {
		return { backend: await detectMobileBackend() };
	}),

	/** For the cloud/Limrun backend: mints (or reuses) an instance and hands
	 * back just the WebSocket URL + token `<RemoteControl />` needs. */
	limrunSession: protectedProcedure
		.input(z.object({ platform: z.enum(["ios", "android"]).default("ios") }))
		.mutation(async ({ input }) => createLimrunSession(input.platform)),

	/** For a local host: starts (or reuses) the appropriate mirroring server
	 * and returns the local port whose page the pane embeds in a `<webview>`. */
	localSession: protectedProcedure
		.input(z.object({ platform: z.enum(["local-ios", "local-android"]) }))
		.mutation(async ({ input }) => {
			const { port } =
				input.platform === "local-ios"
					? await ensureLocalIosServer()
					: await ensureLocalAndroidServer();
			return { url: `http://127.0.0.1:${port}` };
		}),
});
