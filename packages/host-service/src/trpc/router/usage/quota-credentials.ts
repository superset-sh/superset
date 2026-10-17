import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import type { UsageAccount } from "./types";

export type UnavailableQuotaSlot = Pick<
	UsageAccount,
	"agent" | "accountKey" | "sourceLabel" | "selection"
>;

export function unavailableQuotaAccount(
	slot: UnavailableQuotaSlot,
): UsageAccount {
	return {
		...slot,
		credentialKind: "subscription",
		email: null,
		plan: null,
		status: "unavailable",
		statusDetail: "Quota credentials could not be verified.",
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		isDefault: false,
		fetchedAt: new Date(),
	};
}

export class QuotaCredentialReadError extends Error {
	constructor() {
		super("Quota credentials could not be verified.");
	}
}

export async function readQuotaCredentialFile(
	path: string,
	maxBytes = 1024 * 1024,
): Promise<string | null> {
	let file: FileHandle | undefined;
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new QuotaCredentialReadError();
	}
	try {
		const before = await file.stat();
		if (!before.isFile() || before.size > maxBytes) {
			throw new QuotaCredentialReadError();
		}
		const buffer = Buffer.alloc(before.size + 1);
		let offset = 0;
		while (offset < buffer.length) {
			const { bytesRead } = await file.read(
				buffer,
				offset,
				buffer.length - offset,
				offset,
			);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		const after = await file.stat();
		if (
			offset !== before.size ||
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs
		) {
			throw new QuotaCredentialReadError();
		}
		return new TextDecoder("utf-8", { fatal: true }).decode(
			buffer.subarray(0, offset),
		);
	} catch {
		throw new QuotaCredentialReadError();
	} finally {
		await file.close();
	}
}

export function parseQuotaCredentialJson(raw: string): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(raw);
		if (value && typeof value === "object" && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
	} catch {}
	throw new QuotaCredentialReadError();
}
