import { afterEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

mock.module("@superset/db/client", () => ({
	db: {},
}));

const { createCapabilityArtifactResponse } = await import("./route");

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

let tempDirectories: string[] = [];

function sha256(bytes: Uint8Array | Buffer | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

afterEach(async () => {
	await Promise.all(
		tempDirectories.map((directory) =>
			rm(directory, { recursive: true, force: true }),
		),
	);
	tempDirectories = [];
});

describe("capability artifact route responses", () => {
	test("serves a local file artifact after checksum validation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "superset-artifact-"));
		tempDirectories.push(directory);
		const bytes = Buffer.from("capability archive");
		const filePath = join(directory, "artifact.zip");
		await writeFile(filePath, bytes);
		const artifactSha256 = sha256(bytes);

		const response = await createCapabilityArtifactResponse({
			id: VERSION_ID,
			artifactUrl: pathToFileURL(filePath).toString(),
			artifactSha256,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/zip");
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=31536000, immutable",
		);
		expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
			"capability archive",
		);
	});

	test("rejects a local file artifact when the checksum does not match", async () => {
		const directory = await mkdtemp(join(tmpdir(), "superset-artifact-"));
		tempDirectories.push(directory);
		const filePath = join(directory, "artifact.zip");
		await writeFile(filePath, Buffer.from("capability archive"));

		const response = await createCapabilityArtifactResponse({
			id: VERSION_ID,
			artifactUrl: pathToFileURL(filePath).toString(),
			artifactSha256:
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

		expect(response.status).toBe(409);
		expect(await response.text()).toBe("Capability artifact checksum mismatch");
	});

	test("redirects http artifact URLs", async () => {
		const response = await createCapabilityArtifactResponse({
			id: VERSION_ID,
			artifactUrl: "https://blob.example/capability.zip",
			artifactSha256:
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://blob.example/capability.zip",
		);
	});
});
