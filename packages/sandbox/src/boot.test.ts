import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLOUD_AGENT_LAUNCH_ENV_NAMES } from "@superset/shared/cloud-agent-launch";

const boot = readFileSync(
	join(import.meta.dir, "../bundle/rootfs/usr/local/bin/superset-boot"),
	"utf8",
);

describe("superset-boot", () => {
	test.each([
		...CLOUD_AGENT_LAUNCH_ENV_NAMES,
	])("hands %s to host-service", (name) => {
		expect(boot).toMatch(new RegExp(`\\b${name}\\b`));
	});
});
