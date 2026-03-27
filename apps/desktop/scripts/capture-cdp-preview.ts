import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronPath from "electron";

interface MintedDesktopSession {
	email: string;
	expiresAt: string;
	name: string;
	organizationId: string;
	token: string;
	userId: string;
}

interface CdpTarget {
	title: string;
	url: string;
	webSocketDebuggerUrl: string;
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPreviewId(): string {
	return `${new Date().toISOString().replaceAll(":", "-")}-signed-in-cdp-preview`;
}

function runCommand(
	args: string[],
	env: NodeJS.ProcessEnv,
	inheritStdout = true,
) {
	return spawnSync(process.execPath, args, {
		cwd: process.cwd(),
		env,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
		stdio: inheritStdout ? "inherit" : ["ignore", "pipe", "inherit"],
	});
}

function readBooleanEnv(name: string): boolean {
	const value = process.env[name];
	if (!value) return false;

	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function shouldMintDesktopAuth(): boolean {
	if (process.env.DESKTOP_E2E_AUTH_TOKEN) {
		return false;
	}

	return (
		readBooleanEnv("DESKTOP_E2E_AUTH") ||
		Boolean(process.env.DESKTOP_E2E_AUTH_EMAIL)
	);
}

function mintDesktopAuth(env: NodeJS.ProcessEnv): MintedDesktopSession {
	const mintResult = runCommand(["run", "e2e:auth"], env, false);

	if (mintResult.status !== 0) {
		throw new Error("Failed to mint desktop E2E auth session.");
	}

	const stdout = mintResult.stdout?.trim();
	if (!stdout) {
		throw new Error("Desktop E2E auth mint command did not return JSON.");
	}

	return JSON.parse(stdout) as MintedDesktopSession;
}

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status}`);
	}

	return (await response.json()) as T;
}

function connectToCdpTarget(target: CdpTarget) {
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	let nextId = 1;
	const pending = new Map<
		number,
		(msg: { error?: unknown; result?: unknown }) => void
	>();

	ws.addEventListener("message", (event) => {
		const msg = JSON.parse(event.data as string) as {
			id?: number;
			error?: unknown;
			result?: unknown;
		};
		if (msg.id && pending.has(msg.id)) {
			pending.get(msg.id)?.(msg);
			pending.delete(msg.id);
		}
	});

	const send = async <T>(
		method: string,
		params: Record<string, unknown> = {},
	) =>
		new Promise<T>((resolve, reject) => {
			const id = nextId++;
			pending.set(id, (msg) => {
				if (msg.error) {
					reject(new Error(JSON.stringify(msg.error)));
					return;
				}

				resolve(msg.result as T);
			});
			ws.send(JSON.stringify({ id, method, params }));
		});

	return {
		send,
		waitForOpen: () =>
			new Promise<void>((resolve, reject) => {
				ws.addEventListener("open", () => resolve(), { once: true });
				ws.addEventListener(
					"error",
					(event) => reject(new Error(String(event))),
					{ once: true },
				);
			}),
		close: () => ws.close(),
	};
}

async function waitForRendererTarget(port: number): Promise<CdpTarget> {
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		try {
			const targets = await fetchJson<CdpTarget[]>(
				`http://127.0.0.1:${port}/json/list`,
			);
			const pageTarget = targets.find((target) =>
				target.url.includes("index.html#/"),
			);
			if (pageTarget) {
				return pageTarget;
			}
		} catch {}

		await delay(500);
	}

	throw new Error("Timed out waiting for Electron renderer target.");
}

async function waitForSignedInRoute(
	send: <T>(method: string, params?: Record<string, unknown>) => Promise<T>,
) {
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		const result = await send<{
			result: {
				value: {
					hash: string;
					href: string;
					textSample: string;
				};
			};
		}>("Runtime.evaluate", {
			expression: `(() => ({
				href: window.location.href,
				hash: window.location.hash,
				textSample: (document.body?.innerText ?? "").slice(0, 500),
			}))()`,
			returnByValue: true,
			awaitPromise: true,
		});

		const value = result.result.value;
		if (
			value.hash.includes("/welcome") ||
			value.hash.includes("/_authenticated") ||
			value.hash.includes("/create-organization")
		) {
			return value;
		}

		await delay(500);
	}

	throw new Error("Timed out waiting for a signed-in desktop route.");
}

const previewDir = join(
	process.cwd(),
	"test-results",
	"desktop-e2e",
	"previews",
	createPreviewId(),
);
const framesDir = join(previewDir, "frames");
const screenshotPath = join(previewDir, "signed-in-app.png");
const videoPath = join(previewDir, "signed-in-app.webm");
const metadataPath = join(previewDir, "signed-in-app.json");

mkdirSync(framesDir, { recursive: true });

const mintedDesktopAuth = shouldMintDesktopAuth()
	? mintDesktopAuth({
			...process.env,
			DESKTOP_E2E_AUTH: "1",
		})
	: null;

const authToken =
	process.env.DESKTOP_E2E_AUTH_TOKEN ?? mintedDesktopAuth?.token;
const authExpiresAt =
	process.env.DESKTOP_E2E_AUTH_EXPIRES_AT ?? mintedDesktopAuth?.expiresAt;

if (!authToken || !authExpiresAt) {
	throw new Error(
		"capture-cdp-preview requires a desktop auth token or DESKTOP_E2E_AUTH=1.",
	);
}

const remoteDebuggingPort = 9333;
const supersetHomeDir = mkdtempSync(join(tmpdir(), "superset-desktop-cdp-"));
const appEntry = join(process.cwd(), "dist", "main", "index.js");

const electronProcess = spawn(
	electronPath,
	[`--remote-debugging-port=${remoteDebuggingPort}`, appEntry],
	{
		cwd: process.cwd(),
		env: {
			...process.env,
			NODE_ENV: "test",
			DESKTOP_TEST_MODE: "1",
			DESKTOP_TEST_AUTH_TOKEN: authToken,
			DESKTOP_TEST_AUTH_EXPIRES_AT: authExpiresAt,
			SUPERSET_HOME_DIR: supersetHomeDir,
		},
		stdio: "ignore",
	},
);

try {
	const target = await waitForRendererTarget(remoteDebuggingPort);
	const cdp = connectToCdpTarget(target);
	await cdp.waitForOpen();
	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");
	await delay(1_500);

	const signedInRoute = await waitForSignedInRoute(cdp.send);

	const metadata = await cdp.send<{
		result: {
			value: {
				hash: string;
				href: string;
				readyState: string;
				testMode: boolean | null;
				textSample: string;
				title: string;
			};
		};
	}>("Runtime.evaluate", {
		expression: `(() => ({
			href: window.location.href,
			hash: window.location.hash,
			title: document.title,
			readyState: document.readyState,
			textSample: (document.body?.innerText ?? "").slice(0, 500),
			testMode: window.App?.testMode ?? null,
		}))()`,
		returnByValue: true,
		awaitPromise: true,
	});

	const screenshot = await cdp.send<{ data: string }>(
		"Page.captureScreenshot",
		{
			format: "png",
			fromSurface: true,
		},
	);
	writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

	for (let index = 0; index < 12; index += 1) {
		const frame = await cdp.send<{ data: string }>("Page.captureScreenshot", {
			format: "png",
			fromSurface: true,
		});
		writeFileSync(
			join(framesDir, `frame-${String(index).padStart(4, "0")}.png`),
			Buffer.from(frame.data, "base64"),
		);
		await delay(250);
	}

	const ffmpegResult = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-framerate",
			"4",
			"-i",
			join(framesDir, "frame-%04d.png"),
			"-c:v",
			"libvpx-vp9",
			"-pix_fmt",
			"yuv420p",
			videoPath,
		],
		{
			cwd: process.cwd(),
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	if (ffmpegResult.status !== 0) {
		throw new Error(
			`ffmpeg failed to create preview video: ${ffmpegResult.stderr}`,
		);
	}

	writeFileSync(
		metadataPath,
		JSON.stringify(
			{
				...metadata.result.value,
				auth: mintedDesktopAuth
					? {
							email: mintedDesktopAuth.email,
							expiresAt: mintedDesktopAuth.expiresAt,
							organizationId: mintedDesktopAuth.organizationId,
							userId: mintedDesktopAuth.userId,
						}
					: null,
				devtoolsUrl: target.url,
				framesDir,
				screenshotPath,
				signedInRoute,
				supersetHomeDir,
				videoPath,
			},
			null,
			2,
		),
	);

	cdp.close();

	console.log(
		JSON.stringify(
			{
				previewDir,
				screenshotPath,
				videoPath,
				metadataPath,
			},
			null,
			2,
		),
	);
} finally {
	electronProcess.kill("SIGTERM");
	await delay(500);
	if (!electronProcess.killed) {
		electronProcess.kill("SIGKILL");
	}
}
