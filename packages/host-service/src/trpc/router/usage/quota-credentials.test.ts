import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectKeychainSecrets } from "./profiles";
import {
	parseQuotaCredentialJson,
	readQuotaCredentialFile,
} from "./quota-credentials";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
async function directory() {
	const dir = await mkdtemp(join(tmpdir(), "superset-quota-credentials-"));
	directories.push(dir);
	return dir;
}

test("missing credential files differ from unreadable paths", async () => {
	const dir = await directory();
	expect(await readQuotaCredentialFile(join(dir, "absent"))).toBeNull();
	await writeFile(join(dir, "not-directory"), "synthetic");
	await expect(
		readQuotaCredentialFile(join(dir, "not-directory", "child")),
	).rejects.toThrow("Quota credentials could not be verified.");
});

test("quota reads refuse non-regular, oversized and invalid UTF-8 data", async () => {
	const dir = await directory();
	await expect(readQuotaCredentialFile(dir)).rejects.toThrow(
		"could not be verified",
	);
	const path = join(dir, "credentials");
	await writeFile(path, "five!");
	await expect(readQuotaCredentialFile(path, 4)).rejects.toThrow(
		"could not be verified",
	);
	await writeFile(path, Buffer.from([0xff]));
	await expect(readQuotaCredentialFile(path)).rejects.toThrow(
		"could not be verified",
	);
	const fifo = join(dir, "fifo");
	execFileSync("mkfifo", [fifo]);
	await expect(readQuotaCredentialFile(fifo)).rejects.toThrow(
		"could not be verified",
	);
});

test("malformed or non-object credential JSON never exposes its contents", () => {
	for (const raw of ["synthetic-secret", "null", "[]", '"synthetic-secret"']) {
		expect(() => parseQuotaCredentialJson(raw)).toThrow(
			"Quota credentials could not be verified.",
		);
	}
	expect(parseQuotaCredentialJson('{"tokens":{}}')).toEqual({ tokens: {} });
});

test("strict Keychain reads distinguish missing items from permission and timeout failures", async () => {
	const missing = async () => {
		throw Object.assign(new Error("synthetic"), { code: 44 });
	};
	expect(await collectKeychainSecrets([[]], missing, true)).toEqual([]);
	for (const error of [
		Object.assign(new Error("synthetic-secret"), { code: 128 }),
		Object.assign(new Error("synthetic-secret"), { killed: true }),
	]) {
		await expect(
			collectKeychainSecrets(
				[[]],
				async () => {
					throw error;
				},
				true,
			),
		).rejects.toThrow("Quota credentials could not be verified.");
	}
	expect(
		await collectKeychainSecrets(
			[[], ["-a", "test"]],
			async () => "same",
			true,
		),
	).toEqual(["same"]);
});
