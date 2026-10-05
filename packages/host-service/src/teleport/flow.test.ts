import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TELEPORT_STEPS } from "@superset/shared/teleport";
import {
	runTeleport,
	type TeleportOperations,
	type TeleportProgress,
} from "@superset/shared/teleport-driver";
import { bundleHandoff } from "./bundle";
import { captureHandoff } from "./capture";
import { createGitRunner } from "./git-runner";
import { checkDestination, readDestinationBranch } from "./preflight";
import { restoreHandoff } from "./restore";
import { summarizeWorkingTree } from "./working-tree";

/**
 * The whole flow, end to end: the real driver sequencing the real git core
 * over two real repositories. Only the two hosts are collapsed into one
 * process — every git operation is the one that would run in production.
 *
 * This is the test that would catch an ordering bug the unit tests cannot:
 * the driver passing the wrong bundle path, or the source being stopped
 * before the destination had the work.
 */

const REF = "refs/superset/teleport/flow";

let root: string;
let source: string;
let destination: string;
let sourceStopped: boolean;
let programsStarted: boolean;

async function git(dir: string, args: string[]): Promise<string> {
	return createGitRunner(dir).run(args);
}

beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), "teleport-flow-"));
	source = join(root, "laptop");
	destination = join(root, "desktop");
	sourceStopped = false;
	programsStarted = false;

	await mkdir(source, { recursive: true });
	await git(source, ["init", "-q", "--initial-branch=main"]);
	await git(source, ["config", "user.email", "test@superset.invalid"]);
	await git(source, ["config", "user.name", "Test"]);
	await git(source, ["config", "commit.gpgsign", "false"]);
	await writeFile(join(source, "app.ts"), "export const version = 1;\n");
	await writeFile(join(source, ".gitignore"), ".env\nnode_modules/\n");
	await git(source, ["add", "-A"]);
	await git(source, ["commit", "-q", "-m", "base"]);

	await git(root, ["clone", "-q", source, destination]);
	await git(destination, ["config", "user.email", "test@superset.invalid"]);
	await git(destination, ["config", "user.name", "Test"]);
	await git(destination, ["config", "commit.gpgsign", "false"]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** The operations, wired to the real core on both sides. */
function createOperations(): TeleportOperations {
	return {
		askAgentsForHandoff: async () => {
			// What the real one asks an agent to produce; written here so the
			// note travels through the capture like any other file.
			await mkdir(join(source, ".superset", "teleport"), { recursive: true });
			await writeFile(
				join(source, ".superset", "teleport", "handoff-1.md"),
				"# Handoff\nMid-refactor of app.ts. Next: bump the version.\n",
			);
		},

		capture: async () => {
			const { tips } = await readDestinationBranch(destination, "main");
			const bundlePath = join(root, "handoff.bundle");
			await captureHandoff({ worktreePath: source, ref: REF });
			await bundleHandoff({
				worktreePath: source,
				ref: REF,
				destinationTips: tips,
				outputPath: bundlePath,
			});
			return { ref: REF, bundlePath };
		},

		createWorktree: async (capture) => ({
			workspaceId: "desktop-workspace",
			// Standing in for the transfer: the destination reads its own copy.
			bundlePath: capture.bundlePath,
		}),

		restore: async ({ ref, bundlePath }) => {
			await git(destination, ["fetch", "-q", bundlePath, `${ref}:${ref}`]);
			await restoreHandoff({ worktreePath: destination, ref });
		},

		runSetupScripts: async () => {},
		rebuildTabs: async () => {},
		stopSource: async () => {
			sourceStopped = true;
		},
		startPrograms: async () => {
			programsStarted = true;
		},
	};
}

test("a dirty workspace arrives intact on the other host", async () => {
	// A realistic in-flight state: a staged change, an unstaged edit on top
	// of it, a new file, and an ignored .env.
	await writeFile(join(source, "app.ts"), "export const version = 2;\n");
	await git(source, ["add", "app.ts"]);
	await writeFile(
		join(source, "app.ts"),
		"export const version = 2;\n// still editing\n",
	);
	await writeFile(join(source, "feature.ts"), "export const flag = true;\n");
	await writeFile(join(source, ".env"), "API_KEY=secret\n");

	const before = await summarizeWorkingTree(source);
	expect(before).toMatchObject({ modified: 1, untracked: 1, preciousFiles: 1 });

	const progress: TeleportProgress[] = [];
	const result = await runTeleport(createOperations(), (event) =>
		progress.push(event),
	);

	expect(result.failedAt).toBeNull();
	expect(result.destinationWorkspaceId).toBe("desktop-workspace");
	expect(progress.filter((event) => event.state === "done")).toHaveLength(
		TELEPORT_STEPS.length,
	);

	// The working tree, the staged/unstaged split, the new file, the ignored
	// secret, and the agent's handoff note all arrived.
	expect(await readFile(join(destination, "app.ts"), "utf8")).toBe(
		"export const version = 2;\n// still editing\n",
	);
	expect(await git(destination, ["show", ":app.ts"])).toBe(
		"export const version = 2;",
	);
	expect(await readFile(join(destination, "feature.ts"), "utf8")).toBe(
		"export const flag = true;\n",
	);
	expect(await readFile(join(destination, ".env"), "utf8")).toBe(
		"API_KEY=secret\n",
	);
	expect(
		await readFile(
			join(destination, ".superset", "teleport", "handoff-1.md"),
			"utf8",
		),
	).toContain("Next: bump the version.");

	// And the source kept everything: teleport moves work, it does not
	// destroy it.
	expect(sourceStopped).toBe(true);
	expect(programsStarted).toBe(true);
	expect(await readFile(join(source, "app.ts"), "utf8")).toBe(
		"export const version = 2;\n// still editing\n",
	);
});

test("a diverged destination is refused before anything runs", async () => {
	await writeFile(join(destination, "other.ts"), "export const x = 1;\n");
	await git(destination, ["add", "-A"]);
	await git(destination, ["commit", "-q", "-m", "work only on the desktop"]);

	const state = await readDestinationBranch(destination, "main");
	const refusal = await checkDestination({
		sourceWorktreePath: source,
		branch: "main",
		destination: state,
	});

	// Both refusals fire here: the clone has main checked out, and it has
	// moved ahead. Either one is enough to stop the dialog.
	expect(refusal).not.toBeNull();
	expect(
		refusal?.kind === "branch-checked-out" ||
			refusal?.kind === "branch-diverged",
	).toBe(true);
});

test("a failure before the hand-over leaves the source running", async () => {
	await writeFile(join(source, "app.ts"), "export const version = 3;\n");

	const operations = createOperations();
	const result = await runTeleport(
		{
			...operations,
			restore: async () => {
				throw new Error("destination disk full");
			},
		},
		() => {},
	);

	expect(result.failedAt).toBe("restore");
	expect(sourceStopped).toBe(false);
	// The capture is still on the source, so a retry costs nothing.
	expect(await git(source, ["rev-parse", REF])).toBeTruthy();
	expect(await readFile(join(source, "app.ts"), "utf8")).toBe(
		"export const version = 3;\n",
	);
});
