import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CLIError } from "@superset/cli-framework";
import { env } from "../env";
import {
	connectionWasRefused,
	type ProxyManifest,
	proxyDirectory,
	proxyHealth,
	proxyIsGone,
	proxyManifest,
	proxyProcessState,
	readProxy,
	removeProxy,
	tryProxyLock,
	writeProxy,
} from "./registry";
import { CDP_PROXY_IDLE_MS } from "./server";

export interface CdpProxyOptions {
	apiKey: string;
	organizationId: string;
	hostId: string;
	workspaceId: string;
	paneId: string;
	upstreamUrl: string;
}

export function cdpProxyId(options: CdpProxyOptions): string {
	return createHmac("sha256", options.apiKey)
		.update(
			JSON.stringify([
				"cdp-proxy-v1",
				new URL(env.SUPERSET_API_URL).href.replace(/\/$/, ""),
				options.organizationId,
				options.hostId,
				options.workspaceId,
				options.paneId,
				new URL(options.upstreamUrl).href,
			]),
		)
		.digest("hex");
}

async function lockProxy(id: string) {
	const deadline = Date.now() + 12_000;
	do {
		const release = tryProxyLock(id);
		if (release) return release;
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (Date.now() < deadline);
	throw new CLIError(
		"CDP proxy startup is locked",
		"Retry once the other invocation finishes",
	);
}

async function launchProxy(
	options: CdpProxyOptions,
	id: string,
): Promise<ProxyManifest> {
	const instance = randomBytes(32).toString("hex");
	const child = spawn(
		process.execPath,
		Bun.main.includes("$bunfs")
			? ["browser", "cdp-proxy", "--instance", instance]
			: [
					fileURLToPath(new URL("./worker-main.ts", import.meta.url)),
					"--instance",
					instance,
				],
		{
			detached: true,
			cwd: proxyDirectory,
			stdio: ["pipe", "pipe", "ignore"],
			env: {
				PATH: process.env.PATH,
				HOME: process.env.HOME,
				USERPROFILE: process.env.USERPROFILE,
				SYSTEMROOT: process.env.SYSTEMROOT,
				SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
				SUPERSET_API_URL: env.SUPERSET_API_URL,
			},
		},
	);
	const exited = new Promise<void>((resolve) =>
		child.once("exit", () => resolve()),
	);
	let manifest: ProxyManifest | undefined;
	try {
		manifest = await new Promise<ProxyManifest>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("Startup timeout")),
				10_000,
			);
			const fail = () => {
				clearTimeout(timeout);
				reject(new Error("Proxy startup failed"));
			};
			let output = "";
			child.once("error", fail);
			child.once("exit", fail);
			child.stdin.on("error", fail);
			child.stdout.on("data", (data: Buffer) => {
				output += data.toString();
				if (output.length > 16_384) {
					fail();
					return;
				}
				if (!output.includes("\n")) return;
				try {
					const parsed = proxyManifest.parse(
						JSON.parse(output.slice(0, output.indexOf("\n"))),
					);
					if (
						parsed.id !== id ||
						parsed.pid !== child.pid ||
						parsed.instance !== instance
					) {
						fail();
						return;
					}
					clearTimeout(timeout);
					resolve(parsed);
				} catch {
					fail();
				}
			});
			child.stdin.write(
				`${JSON.stringify({ id, apiKey: options.apiKey, upstreamUrl: options.upstreamUrl })}\n`,
			);
		});
		writeProxy(manifest);
		await new Promise<void>((resolve, reject) =>
			child.stdin.end("ready\n", (error?: Error) =>
				error ? reject(error) : resolve(),
			),
		);
		child.stdout.destroy();
		child.unref();
		return manifest;
	} catch {
		child.stdin.destroy();
		if (child.pid && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
			const force = setTimeout(() => child.kill("SIGKILL"), 1000);
			await exited;
			clearTimeout(force);
		}
		if (manifest) removeProxy(manifest);
		throw new CLIError(
			"Could not start the local CDP proxy",
			"Check local CLI permissions and try again",
		);
	} finally {
		child.stdin.destroy();
		child.stdout.destroy();
	}
}

export async function ensureCdpProxy(options: CdpProxyOptions) {
	const id = cdpProxyId(options);
	const release = await lockProxy(id);
	try {
		const existing = readProxy(id);
		const health = existing && (await proxyHealth(existing));
		const live = health === "live";
		if (
			existing &&
			!live &&
			!(await proxyIsGone(existing, health ?? undefined))
		)
			throw new CLIError(
				"The existing CDP proxy is not responding",
				`Retry or stop it with: superset browser cdp-stop --id ${id}`,
			);
		const manifest =
			existing && live ? existing : await launchProxy(options, id);
		return {
			url: `${manifest.endpoint.replace(/^http/, "ws")}/cdp?token=${manifest.token}`,
			proxyId: id,
			idleTimeoutSeconds: CDP_PROXY_IDLE_MS / 1000,
		};
	} finally {
		release();
	}
}

export async function stopCdpProxy(id: string): Promise<boolean> {
	const release = await lockProxy(id);
	try {
		const manifest = readProxy(id);
		if (!manifest) return false;
		const processState = await proxyProcessState(manifest);
		if (processState === "unknown") {
			const health = await proxyHealth(manifest);
			if (health === "refused") {
				removeProxy(manifest);
				return true;
			}
			if (health !== "live")
				throw new CLIError(
					"Could not verify the local CDP proxy",
					"The proxy may still be running. Retry the stop command",
				);
		}
		if (processState !== "gone") {
			let response: Response | undefined;
			try {
				response = await fetch(`${manifest.endpoint}/stop`, {
					method: "POST",
					headers: { Authorization: `Bearer ${manifest.stopToken}` },
					signal: AbortSignal.timeout(1000),
					redirect: "error",
				});
			} catch (error) {
				if (
					!(await proxyIsGone(
						manifest,
						connectionWasRefused(error) ? "refused" : "unknown",
					))
				)
					throw new CLIError(
						"Could not stop the local CDP proxy",
						"The proxy may still be running. Retry the stop command",
					);
			}
			if (response && !response.ok)
				throw new CLIError("Could not stop the local CDP proxy");
			const deadline = Date.now() + 2000;
			while (response && !(await proxyIsGone(manifest))) {
				if (Date.now() >= deadline)
					throw new CLIError(
						"The CDP proxy has not stopped yet",
						"Retry the stop command",
					);
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
		removeProxy(manifest);
		return true;
	} finally {
		release();
	}
}
