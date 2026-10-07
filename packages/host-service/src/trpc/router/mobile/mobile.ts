import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
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

async function hasIosSimulators(): Promise<boolean> {
	if (process.platform !== "darwin") return false;
	try {
		await run("xcrun", ["simctl", "list", "devices", "-j"]);
		return true;
	} catch {
		return false;
	}
}

/** GUI-launched apps do not inherit the shell's ANDROID_HOME, and Homebrew
 * installs the SDK outside the default Android Studio location. */
function findAndroidSdk(): string | null {
	const candidates = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		join(homedir(), "Library/Android/sdk"),
		join(homedir(), "Android/Sdk"),
		"/opt/homebrew/share/android-commandlinetools",
		"/usr/local/share/android-commandlinetools",
	];
	for (const dir of candidates) {
		if (dir && existsSync(join(dir, "emulator"))) return dir;
	}
	return null;
}

/** What this host can show a mobile pane with: a sandbox always prefers
 * Limrun (no local toolchain at all); a real machine prefers whichever
 * local toolchain is installed. */
export async function detectMobileBackend(): Promise<MobileBackend> {
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") {
		return process.env.LIM_API_KEY ? "limrun" : "none";
	}
	if (await hasIosSimulators()) return "local-ios";
	if (findAndroidSdk() || (await commandExists("adb"))) return "local-android";
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

const LOCAL_SERVER_START_TIMEOUT_MS = 120_000;

/** Expo's browser UI over every iOS simulator and Android emulator on this
 * machine (github.com/expo/expo-device-hub). */
const DEVICE_HUB_PACKAGE = "expo-device-hub@0.14.0";

async function waitForHttp(
	url: string,
	timeoutMs: number,
	signal: AbortSignal,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline && !signal.aborted) {
		try {
			const response = await fetch(url, { signal });
			if (response.status < 500) return;
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

/** serve-sim keeps per-simulator state under the temp dir, and any other
 * serve-sim on the machine clears it. A private temp dir keeps ours intact. */
function hubStateDir(): string {
	const dir = join(tmpdir(), `superset-device-hub-${process.pid}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

interface LocalServer {
	port: Promise<number>;
	stop: () => void;
}

/** One device hub per host-service, reused across pane remounts.
 * Not persisted: a host-service restart starts fresh, like its other processes. */
let localServer: LocalServer | null = null;

/** The hub keeps serving a frozen frame for an iOS simulator it has seen
 * shut down, even after that simulator boots again. Only a new hub recovers. */
const simulatorsShutDownUnderHub = new Set<string>();

export function stopLocalServer(): void {
	localServer?.stop();
	localServer = null;
	simulatorsShutDownUnderHub.clear();
}

function startLocalServer(): LocalServer {
	const abort = new AbortController();
	let child: ChildProcess | undefined;

	const start = async (): Promise<number> => {
		const port = await getFreePort();
		abort.signal.throwIfAborted();
		const androidSdk = findAndroidSdk();
		const spawned = spawn(
			"npx",
			[
				"--yes",
				DEVICE_HUB_PACKAGE,
				"--port",
				String(port),
				// The default source keeps a portrait frame when the device rotates.
				"--stream-source",
				"scrcpy",
			],
			{
				stdio: ["ignore", "ignore", "pipe"],
				env: {
					...process.env,
					TMPDIR: hubStateDir(),
					...(androidSdk
						? { ANDROID_HOME: androidSdk, ANDROID_SDK_ROOT: androidSdk }
						: {}),
				},
			},
		);
		child = spawned;

		let stderr = "";
		spawned.stderr?.on("data", (chunk) => {
			stderr = `${stderr}${chunk}`.slice(-2000);
		});
		const exited = new Promise<never>((_, reject) => {
			spawned.on("error", reject);
			spawned.on("exit", (code, signal) => {
				if (localServer === server) localServer = null;
				reject(
					new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: [
							`${DEVICE_HUB_PACKAGE} exited (${signal ?? `code ${code}`})`,
							stderr.trim(),
						]
							.filter(Boolean)
							.join(": "),
					}),
				);
			});
		});
		exited.catch(() => {});

		await Promise.race([
			waitForHttp(
				`http://127.0.0.1:${port}`,
				LOCAL_SERVER_START_TIMEOUT_MS,
				abort.signal,
			),
			exited,
		]);
		return port;
	};

	const server: LocalServer = {
		port: start(),
		stop: () => {
			abort.abort();
			child?.kill();
		},
	};
	server.port.catch(() => {
		server.stop();
		if (localServer === server) localServer = null;
	});
	return server;
}

async function ensureLocalServer(): Promise<{ port: number }> {
	localServer ??= startLocalServer();
	return { port: await localServer.port };
}

const hubDeviceSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	platform: z.enum(["ios", "android"]),
	booted: z.boolean(),
});

const hubDevicesSchema = z.object({
	simulators: z.array(hubDeviceSchema),
	emulators: z.array(hubDeviceSchema),
});

const deviceActionSchema = z.object({
	platform: z.enum(["ios", "android"]),
	id: z.string(),
	name: z.string(),
});

async function hubRequest(path: string, body?: unknown): Promise<unknown> {
	const { port } = await ensureLocalServer();
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method: body ? "POST" : "GET",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const result = (await response.json()) as { ok?: boolean; error?: string };
	if (!response.ok || result.ok === false) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error ?? `Device hub answered ${response.status}`,
		});
	}
	return result;
}

const IOS_ORIENTATION_MESSAGE_TAG = 7;

/** serve-sim takes an explicit orientation as one tagged frame on the
 * simulator's input socket; it has no HTTP route for it. */
async function rotateIosSimulator(
	udid: string,
	orientation: "portrait" | "landscape_left",
): Promise<void> {
	const { port } = await ensureLocalServer();
	const socket = new WebSocket(
		`ws://127.0.0.1:${port}/vendor/serve-sim/helper/ws?device=${encodeURIComponent(udid)}`,
	);
	socket.binaryType = "arraybuffer";
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener(
			"error",
			() =>
				reject(
					new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Could not reach the simulator input socket",
					}),
				),
			{ once: true },
		);
	});
	const payload = new TextEncoder().encode(JSON.stringify({ orientation }));
	const frame = new Uint8Array(1 + payload.length);
	frame[0] = IOS_ORIENTATION_MESSAGE_TAG;
	frame.set(payload, 1);
	socket.send(frame);
	setTimeout(() => socket.close(), 50);
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

	/** Released desktop builds embed this URL in a `<webview>`. The hub lists
	 * both platforms, so `platform` no longer selects anything. */
	localSession: protectedProcedure
		.input(z.object({ platform: z.enum(["local-ios", "local-android"]) }))
		.mutation(async () => {
			const { port } = await ensureLocalServer();
			return { url: `http://127.0.0.1:${port}` };
		}),

	/** The hub answers no cross-origin requests for its device API, so the
	 * renderer reaches it through here. */
	localDevices: protectedProcedure.query(async () => {
		const { port } = await ensureLocalServer();
		const devices = hubDevicesSchema.parse(await hubRequest("/api/devices"));
		return {
			hubUrl: `http://127.0.0.1:${port}`,
			devices: [...devices.simulators, ...devices.emulators],
		};
	}),

	bootLocalDevice: protectedProcedure
		.input(deviceActionSchema)
		.mutation(async ({ input }) => {
			if (simulatorsShutDownUnderHub.has(input.id)) stopLocalServer();
			await hubRequest("/api/devices/boot", input);
		}),

	shutdownLocalDevice: protectedProcedure
		.input(deviceActionSchema)
		.mutation(async ({ input }) => {
			await hubRequest("/api/devices/shutdown", input);
			if (input.platform === "ios") simulatorsShutDownUnderHub.add(input.id);
		}),

	restartLocalHub: protectedProcedure.mutation(async () => {
		stopLocalServer();
		await ensureLocalServer();
	}),

	rotateLocalDevice: protectedProcedure
		.input(
			z.object({
				platform: z.enum(["ios", "android"]),
				id: z.string(),
				orientation: z.enum(["portrait", "landscape"]),
			}),
		)
		.mutation(async ({ input }) => {
			if (input.platform === "ios") {
				await rotateIosSimulator(
					input.id,
					input.orientation === "portrait" ? "portrait" : "landscape_left",
				);
				return;
			}
			await hubRequest(
				`/vendor/serve-emu/api/orientation?device=${encodeURIComponent(input.id)}`,
				{ orientation: input.orientation },
			);
		}),
});
