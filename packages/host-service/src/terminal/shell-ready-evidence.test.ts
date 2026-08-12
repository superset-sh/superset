import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	__resetShellReadyEvidenceForTesting,
	getShellReadyMarkerEvidence,
	recordShellReadyMarkerEvidence,
} from "./shell-ready-evidence";

const originalHomeDir = process.env.SUPERSET_HOME_DIR;
let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-ready-evidence-"));
	process.env.SUPERSET_HOME_DIR = tmpDir;
	__resetShellReadyEvidenceForTesting();
});

afterEach(() => {
	if (originalHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalHomeDir;
	}
	__resetShellReadyEvidenceForTesting();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function waitForFile(filePath: string): Promise<void> {
	for (let i = 0; i < 100; i++) {
		try {
			JSON.parse(fs.readFileSync(filePath, "utf8"));
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 10));
		}
	}
	throw new Error(`file never became readable: ${filePath}`);
}

describe("shell-ready evidence", () => {
	test("unknown shells have no evidence", () => {
		expect(getShellReadyMarkerEvidence("zsh")).toBeNull();
	});

	test("recorded evidence round-trips in memory and persists to disk", async () => {
		recordShellReadyMarkerEvidence("zsh", "missing");
		expect(getShellReadyMarkerEvidence("zsh")).toBe("missing");

		const file = path.join(tmpDir, "shell-ready-evidence.json");
		await waitForFile(file);
		expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
			zsh: "missing",
		});
	});

	test("persisted evidence survives a cache reset (process restart)", async () => {
		recordShellReadyMarkerEvidence("zsh", "missing");
		await waitForFile(path.join(tmpDir, "shell-ready-evidence.json"));

		__resetShellReadyEvidenceForTesting();
		expect(getShellReadyMarkerEvidence("zsh")).toBe("missing");
	});

	test("evidence flips when the marker is observed again", () => {
		recordShellReadyMarkerEvidence("zsh", "missing");
		recordShellReadyMarkerEvidence("zsh", "delivered");
		expect(getShellReadyMarkerEvidence("zsh")).toBe("delivered");
	});

	test("a corrupt evidence file reads as no evidence", () => {
		fs.writeFileSync(
			path.join(tmpDir, "shell-ready-evidence.json"),
			"not json",
		);
		expect(getShellReadyMarkerEvidence("zsh")).toBeNull();
	});

	test("unexpected values in the file are ignored", () => {
		fs.writeFileSync(
			path.join(tmpDir, "shell-ready-evidence.json"),
			JSON.stringify({ zsh: "banana", bash: "delivered" }),
		);
		expect(getShellReadyMarkerEvidence("zsh")).toBeNull();
		expect(getShellReadyMarkerEvidence("bash")).toBe("delivered");
	});

	test("no SUPERSET_HOME_DIR keeps evidence in memory only", () => {
		delete process.env.SUPERSET_HOME_DIR;
		__resetShellReadyEvidenceForTesting();
		recordShellReadyMarkerEvidence("zsh", "missing");
		expect(getShellReadyMarkerEvidence("zsh")).toBe("missing");
	});
});
