import { describe, expect, test } from "bun:test";
import {
	mergeSandboxConfigs,
	validateSandboxConfig,
} from "./sandbox-config.ts";

const MACHINE_LOCAL = { machineLocal: true };
const REPO_SOURCE = { machineLocal: false };

describe("validateSandboxConfig", () => {
	test("accepts a full valid config from a machine-local source", () => {
		const config = validateSandboxConfig(
			{
				enabled: true,
				image: "ghcr.io/acme/sandbox:1",
				runtime: "runsc",
				network: "none",
				ports: [3000, 5173, 3000],
				resources: { cpus: 4, memoryMb: 8192, pidsLimit: 1024 },
				mounts: ["/opt/cache", "/etc/certs:ro"],
				env: ["NPM_TOKEN", "MY_VAR"],
				git: { cloneDepth: 50 },
			},
			"test.json",
			MACHINE_LOCAL,
		);
		expect(config).toEqual({
			enabled: true,
			image: "ghcr.io/acme/sandbox:1",
			runtime: "runsc",
			network: "none",
			ports: [3000, 5173],
			resources: { cpus: 4, memoryMb: 8192, pidsLimit: 1024 },
			mounts: ["/opt/cache", "/etc/certs:ro"],
			env: ["NPM_TOKEN", "MY_VAR"],
			git: { cloneDepth: 50 },
		});
	});

	test("drops mounts, env, and agentConfig from repo-shipped sources but keeps the rest", () => {
		const config = validateSandboxConfig(
			{
				enabled: true,
				image: "repo/custom:latest",
				agentConfig: true,
				mounts: ["/Users/victim/.ssh"],
				env: ["AWS_SECRET_ACCESS_KEY"],
			},
			"repo/.superset/config.json",
			REPO_SOURCE,
		);
		// A cloned repo can opt its workspaces into a sandbox and pick an image,
		// but must NOT be able to mount the host's agent credentials.
		expect(config).toEqual({ enabled: true, image: "repo/custom:latest" });
	});

	test("keeps agentConfig from a machine-local source", () => {
		const config = validateSandboxConfig(
			{ enabled: true, agentConfig: true },
			"~/.superset/projects/app/config.json",
			MACHINE_LOCAL,
		);
		expect(config).toEqual({ enabled: true, agentConfig: true });
	});

	test.each([
		["enabled", { enabled: "yes" }],
		["image", { image: "" }],
		["network", { network: "host" }],
		["ports range", { ports: [0] }],
		["ports type", { ports: ["3000"] }],
		["resources.cpus", { resources: { cpus: -1 } }],
		["resources.memoryMb integer", { resources: { memoryMb: 1.5 } }],
		["git.cloneDepth", { git: { cloneDepth: 0 } }],
		["env name", { env: ["1BAD"] }],
		["mount relative path", { mounts: ["relative/path"] }],
		["non-object", []],
	])("rejects invalid %s", (_label, value) => {
		expect(validateSandboxConfig(value, "test.json", MACHINE_LOCAL)).toBeNull();
	});

	test("trims image and runtime", () => {
		expect(
			validateSandboxConfig(
				{ image: " img:1 ", runtime: " runsc " },
				"t",
				MACHINE_LOCAL,
			),
		).toEqual({ image: "img:1", runtime: "runsc" });
	});
});

describe("mergeSandboxConfigs", () => {
	test("later wins per field; nested objects merge one level deep", () => {
		expect(
			mergeSandboxConfigs(
				{
					enabled: true,
					image: "base:1",
					ports: [3000],
					resources: { cpus: 2, memoryMb: 4096 },
					git: { cloneDepth: 10 },
				},
				{
					image: "override:2",
					ports: [8080],
					resources: { memoryMb: 8192 },
				},
			),
		).toEqual({
			enabled: true,
			image: "override:2",
			ports: [8080],
			resources: { cpus: 2, memoryMb: 8192 },
			git: { cloneDepth: 10 },
		});
	});

	test("returns the other side when one is undefined", () => {
		const config = { enabled: true };
		expect(mergeSandboxConfigs(undefined, config)).toBe(config);
		expect(mergeSandboxConfigs(config, undefined)).toBe(config);
	});

	test("override can disable a base-enabled sandbox", () => {
		expect(
			mergeSandboxConfigs({ enabled: true }, { enabled: false })?.enabled,
		).toBe(false);
	});
});
