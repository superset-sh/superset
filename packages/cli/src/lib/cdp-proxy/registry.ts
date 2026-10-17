import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { SUPERSET_HOME_DIR } from "../config";
import { isProcessAlive } from "../host/manifest";
import { inspectProcessCommand } from "../host/process-identity";

export const proxyId = z.string().regex(/^[a-f0-9]{64}$/);
const capability = z.string().regex(/^[a-f0-9]{64}$/);
export const proxyManifest = z.object({
	id: proxyId,
	pid: z.number().int().positive(),
	instance: capability,
	endpoint: z.string().refine((value) => {
		try {
			const url = new URL(value);
			return (
				url.protocol === "http:" &&
				url.hostname === "127.0.0.1" &&
				url.port !== "" &&
				url.origin === value
			);
		} catch {
			return false;
		}
	}),
	token: capability,
	stopToken: capability,
});
export type ProxyManifest = z.infer<typeof proxyManifest>;
export const proxyDirectory = join(SUPERSET_HOME_DIR, "cdp-proxies");

export function readProxy(id: string): ProxyManifest | null {
	proxyId.parse(id);
	try {
		const manifest = proxyManifest.parse(
			JSON.parse(readFileSync(join(proxyDirectory, `${id}.json`), "utf8")),
		);
		return manifest.id === id ? manifest : null;
	} catch {
		return null;
	}
}

export function tryProxyLock(id: string): (() => void) | null {
	proxyId.parse(id);
	mkdirSync(proxyDirectory, { recursive: true, mode: 0o700 });
	chmodSync(proxyDirectory, 0o700);
	const path = join(proxyDirectory, "launch-lock.sqlite");
	const database = new Database(path, { create: true });
	chmodSync(path, 0o600);
	try {
		database.exec("BEGIN IMMEDIATE");
	} catch (error) {
		database.close();
		if ((error as { code?: string }).code === "SQLITE_BUSY") return null;
		throw error;
	}
	return () => {
		try {
			database.exec("ROLLBACK");
		} finally {
			database.close();
		}
	};
}

export function writeProxy(manifest: ProxyManifest) {
	const temporary = join(
		proxyDirectory,
		`.${manifest.id}.${randomBytes(8).toString("hex")}.tmp`,
	);
	try {
		writeFileSync(temporary, JSON.stringify(manifest), { mode: 0o600 });
		renameSync(temporary, join(proxyDirectory, `${manifest.id}.json`));
	} catch (error) {
		try {
			unlinkSync(temporary);
		} catch {}
		throw error;
	}
}

export async function proxyProcessIsAlive(
	manifest: ProxyManifest,
): Promise<boolean> {
	return (await proxyProcessState(manifest)) !== "gone";
}

export async function proxyProcessState(
	manifest: ProxyManifest,
): Promise<"owned" | "gone" | "unknown"> {
	if (!isProcessAlive(manifest.pid)) return "gone";
	const command = await inspectProcessCommand(manifest.pid);
	if (command === null) return "unknown";
	return command.includes(`--instance ${manifest.instance}`) ? "owned" : "gone";
}

export async function proxyIsGone(
	manifest: ProxyManifest,
	health?: ProxyHealth,
): Promise<boolean> {
	const processState = await proxyProcessState(manifest);
	if (processState === "gone") return true;
	return (
		processState === "unknown" &&
		(health ?? (await proxyHealth(manifest))) === "refused"
	);
}

export function removeProxy(manifest: ProxyManifest) {
	const current = readProxy(manifest.id);
	if (current?.pid === manifest.pid && current.stopToken === manifest.stopToken)
		unlinkSync(join(proxyDirectory, `${manifest.id}.json`));
}

type ProxyHealth = "live" | "refused" | "unknown";

export function connectionWasRefused(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = "code" in error ? error.code : undefined;
	return (
		code === "ConnectionRefused" ||
		code === "ECONNREFUSED" ||
		("cause" in error &&
			error.cause !== error &&
			connectionWasRefused(error.cause))
	);
}

export async function proxyHealth(
	manifest: ProxyManifest,
): Promise<ProxyHealth> {
	try {
		const response = await fetch(`${manifest.endpoint}/health`, {
			headers: { Authorization: `Bearer ${manifest.stopToken}` },
			signal: AbortSignal.timeout(500),
			redirect: "error",
		});
		const body = (await response.json()) as { id?: string; pid?: number };
		return response.ok && body.id === manifest.id && body.pid === manifest.pid
			? "live"
			: "unknown";
	} catch (error) {
		return connectionWasRefused(error) ? "refused" : "unknown";
	}
}
