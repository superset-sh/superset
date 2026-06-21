import { afterEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { capabilityArtifactReference } from "@superset/shared/capability-artifacts";

mock.module("@superset/db/client", () => ({
	db: {},
}));

const { createCapabilityArtifactResponse } = await import("./route");

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ORIGINAL_SUPERSET_HOME_DIR = process.env.SUPERSET_HOME_DIR;

let tempDirectories: string[] = [];

function sha256(bytes: Uint8Array | Buffer | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

afterEach(async () => {
	if (ORIGINAL_SUPERSET_HOME_DIR === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = ORIGINAL_SUPERSET_HOME_DIR;
	}
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
			artifactPathname: "legacy/artifact.zip",
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
			artifactPathname: "legacy/artifact.zip",
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
			artifactPathname: "blob/artifact.zip",
			artifactSha256:
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://blob.example/capability.zip",
		);
	});

	test("serves a server artifact reference from SUPERSET_HOME_DIR", async () => {
		const homeDirectory = await mkdtemp(join(tmpdir(), "superset-home-"));
		tempDirectories.push(homeDirectory);
		process.env.SUPERSET_HOME_DIR = homeDirectory;
		const bytes = Buffer.from("server artifact archive");
		const artifactPathname =
			"capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip";
		const artifactPath = join(
			homeDirectory,
			"capability-artifacts",
			artifactPathname,
		);
		await mkdir(dirname(artifactPath), { recursive: true });
		await writeFile(artifactPath, bytes);
		const response = await createCapabilityArtifactResponse({
			id: VERSION_ID,
			artifactUrl: capabilityArtifactReference(artifactPathname),
			artifactPathname,
			artifactSha256: sha256(bytes),
		});

		expect(response.status).toBe(200);
		expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
			"server artifact archive",
		);
	});

	test("serves a server artifact reference through the storage reader", async () => {
		const bytes = Buffer.from("object storage archive");
		const artifactPathname =
			"capability-packages/org/twitter-spacex-cli/1.0.1/archive.zip";

		const response = await createCapabilityArtifactResponse(
			{
				id: VERSION_ID,
				artifactUrl: capabilityArtifactReference(artifactPathname),
				artifactPathname,
				artifactSha256: sha256(bytes),
			},
			{
				readArtifactReference: async (pathname) =>
					pathname === artifactPathname ? bytes : null,
			},
		);

		expect(response.status).toBe(200);
		expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
			"object storage archive",
		);
	});
});
