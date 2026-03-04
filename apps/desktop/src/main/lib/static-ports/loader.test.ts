import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasStaticPortsConfig, loadStaticPorts } from "./loader";

const TEST_DIR = join(tmpdir(), `superset-test-loader-${process.pid}`);
const WORKTREE_PATH = join(TEST_DIR, "worktree");
const SUPERSET_DIR = join(WORKTREE_PATH, ".superset");
const PORTS_FILE = join(SUPERSET_DIR, "ports.json");

describe("loadStaticPorts", () => {
	beforeEach(() => {
		mkdirSync(SUPERSET_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns exists: false when ports.json does not exist", () => {
		rmSync(PORTS_FILE, { force: true });
		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result).toEqual({ exists: false, ports: null, error: null });
	});

	test("loads valid ports.json with single port", () => {
		const config = {
			ports: [{ port: 3000, label: "Frontend" }],
		};
		writeFileSync(PORTS_FILE, JSON.stringify(config));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result).toEqual({
			exists: true,
			ports: [{ port: 3000, label: "Frontend" }],
			error: null,
		});
	});

	test("loads valid ports.json with multiple ports", () => {
		const config = {
			ports: [
				{ port: 3000, label: "Frontend" },
				{ port: 8080, label: "API Server" },
				{ port: 5432, label: "PostgreSQL" },
			],
		};
		writeFileSync(PORTS_FILE, JSON.stringify(config));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result).toEqual({
			exists: true,
			ports: [
				{ port: 3000, label: "Frontend" },
				{ port: 8080, label: "API Server" },
				{ port: 5432, label: "PostgreSQL" },
			],
			error: null,
		});
	});

	test("trims whitespace from labels", () => {
		const config = {
			ports: [{ port: 3000, label: "  Frontend  " }],
		};
		writeFileSync(PORTS_FILE, JSON.stringify(config));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.ports?.[0].label).toBe("Frontend");
	});

	test("returns error for invalid JSON syntax", () => {
		writeFileSync(PORTS_FILE, "{ invalid json }");

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toContain("Invalid JSON");
	});

	test("returns error when ports.json is not an object", () => {
		writeFileSync(PORTS_FILE, '"just a string"');

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports.json must contain a JSON object");
	});

	test("returns error when ports key is missing", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ other: "field" }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports.json is missing required field 'ports'");
	});

	test("returns error when ports is not an array", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: "not-an-array" }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("'ports' field must be an array");
	});

	test("returns error when port entry is not an object", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: ["not-an-object"] }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0] must be an object");
	});

	test("returns error when port field is missing", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: [{ label: "Test" }] }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0] is missing required field 'port'");
	});

	test("returns error when label field is missing", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: [{ port: 3000 }] }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0] is missing required field 'label'");
	});

	test("returns error when port is not a number", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: "3000", label: "Test" }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].port must be an integer");
	});

	test("returns error when port is not an integer", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 3000.5, label: "Test" }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].port must be an integer");
	});

	test("returns error when port is below 1", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 0, label: "Test" }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].port must be between 1 and 65535");
	});

	test("returns error when port is above 65535", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 65536, label: "Test" }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].port must be between 1 and 65535");
	});

	test("returns error when label is not a string", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 3000, label: 123 }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].label must be a string");
	});

	test("returns error when label is empty", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 3000, label: "" }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].label cannot be empty");
	});

	test("returns error when label is only whitespace", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({ ports: [{ port: 3000, label: "   " }] }),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[0].label cannot be empty");
	});

	test("returns error with correct index for second invalid entry", () => {
		writeFileSync(
			PORTS_FILE,
			JSON.stringify({
				ports: [
					{ port: 3000, label: "Valid" },
					{ port: "invalid", label: "Test" },
				],
			}),
		);

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toBeNull();
		expect(result.error).toBe("ports[1].port must be an integer");
	});

	test("accepts valid boundary port numbers", () => {
		const config = {
			ports: [
				{ port: 1, label: "Min port" },
				{ port: 65535, label: "Max port" },
			],
		};
		writeFileSync(PORTS_FILE, JSON.stringify(config));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result.exists).toBe(true);
		expect(result.ports).toHaveLength(2);
		expect(result.error).toBeNull();
	});

	test("handles empty ports array", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: [] }));

		const result = loadStaticPorts(WORKTREE_PATH);
		expect(result).toEqual({ exists: true, ports: [], error: null });
	});
});

describe("hasStaticPortsConfig", () => {
	beforeEach(() => {
		mkdirSync(SUPERSET_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("returns false when ports.json does not exist", () => {
		expect(hasStaticPortsConfig(WORKTREE_PATH)).toBe(false);
	});

	test("returns true when ports.json exists", () => {
		writeFileSync(PORTS_FILE, JSON.stringify({ ports: [] }));
		expect(hasStaticPortsConfig(WORKTREE_PATH)).toBe(true);
	});

	test("returns true even when ports.json is invalid", () => {
		writeFileSync(PORTS_FILE, "invalid json");
		expect(hasStaticPortsConfig(WORKTREE_PATH)).toBe(true);
	});
});
