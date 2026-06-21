import { afterEach, describe, expect, test } from "bun:test";
import {
	readCapabilityArtifactReference,
	storeCapabilityArtifact,
} from "./artifact-storage";

const ORIGINAL_ENV = {
	BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
	NODE_ENV: process.env.NODE_ENV,
	SUPERSET_OBJECT_STORAGE_ACCESS_KEY:
		process.env.SUPERSET_OBJECT_STORAGE_ACCESS_KEY,
	SUPERSET_OBJECT_STORAGE_BUCKET: process.env.SUPERSET_OBJECT_STORAGE_BUCKET,
	SUPERSET_OBJECT_STORAGE_ENDPOINT:
		process.env.SUPERSET_OBJECT_STORAGE_ENDPOINT,
	SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE:
		process.env.SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE,
	SUPERSET_OBJECT_STORAGE_REGION: process.env.SUPERSET_OBJECT_STORAGE_REGION,
	SUPERSET_OBJECT_STORAGE_SECRET_KEY:
		process.env.SUPERSET_OBJECT_STORAGE_SECRET_KEY,
	SUPERSET_ONLINE_SERVICE: process.env.SUPERSET_ONLINE_SERVICE,
};
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv() {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function clearObjectStorageEnv() {
	delete process.env.SUPERSET_OBJECT_STORAGE_ACCESS_KEY;
	delete process.env.SUPERSET_OBJECT_STORAGE_BUCKET;
	delete process.env.SUPERSET_OBJECT_STORAGE_ENDPOINT;
	delete process.env.SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE;
	delete process.env.SUPERSET_OBJECT_STORAGE_REGION;
	delete process.env.SUPERSET_OBJECT_STORAGE_SECRET_KEY;
}

function configureObjectStorage() {
	process.env.SUPERSET_OBJECT_STORAGE_ENDPOINT = "http://127.0.0.1:9000";
	process.env.SUPERSET_OBJECT_STORAGE_BUCKET = "superset-artifacts";
	process.env.SUPERSET_OBJECT_STORAGE_REGION = "us-east-1";
	process.env.SUPERSET_OBJECT_STORAGE_ACCESS_KEY = "superset";
	process.env.SUPERSET_OBJECT_STORAGE_SECRET_KEY = "superset-local-artifacts";
	process.env.SUPERSET_OBJECT_STORAGE_FORCE_PATH_STYLE = "1";
	delete process.env.BLOB_READ_WRITE_TOKEN;
}

afterEach(() => {
	restoreEnv();
	globalThis.fetch = ORIGINAL_FETCH;
});

describe("capability artifact storage", () => {
	test("stores object-storage artifacts behind an internal reference", async () => {
		configureObjectStorage();
		const calls: Array<{ url: string; method: string; headers: Headers }> = [];
		globalThis.fetch = async (input, init) => {
			calls.push({
				url: input.toString(),
				method: init?.method ?? "GET",
				headers: new Headers(init?.headers),
			});
			return new Response(null, { status: 200 });
		};

		const artifact = await storeCapabilityArtifact({
			pathname: "capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
			archiveBuffer: Buffer.from("zip bytes"),
		});

		expect(artifact.url).toBe(
			"superset-artifact:capability-packages%2Forg%2Ftwitter-spacex-cli%2F1.0.0%2Farchive.zip",
		);
		expect(artifact.pathname).toBe(
			"capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "PUT",
			url: "http://127.0.0.1:9000/superset-artifacts/capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
		});
		expect(calls[0]?.headers.get("authorization")).toContain(
			"AWS4-HMAC-SHA256",
		);
	});

	test("reads object-storage artifacts through the internal reference key", async () => {
		configureObjectStorage();
		globalThis.fetch = async (input, init) => {
			expect(input.toString()).toBe(
				"http://127.0.0.1:9000/superset-artifacts/capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
			);
			expect(init?.method).toBe("GET");
			return new Response("zip bytes", { status: 200 });
		};

		const bytes = await readCapabilityArtifactReference(
			"capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
		);

		expect(bytes?.toString()).toBe("zip bytes");
	});

	test("online service does not fall back to local artifact storage", async () => {
		clearObjectStorageEnv();
		process.env.NODE_ENV = "development";
		process.env.SUPERSET_ONLINE_SERVICE = "1";
		delete process.env.BLOB_READ_WRITE_TOKEN;

		await expect(
			storeCapabilityArtifact({
				pathname:
					"capability-packages/org/twitter-spacex-cli/1.0.0/archive.zip",
				archiveBuffer: Buffer.from("zip bytes"),
			}),
		).rejects.toThrow("Capability artifact storage is not configured");
	});
});
