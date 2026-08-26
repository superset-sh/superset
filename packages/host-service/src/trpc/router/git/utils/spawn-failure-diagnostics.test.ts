import { describe, expect, test } from "bun:test";
import { readErrorDiagnostics } from "../../../error-diagnostics";
import { attachSpawnFailureDiagnostics } from "./spawn-failure-diagnostics";

function diagnose(message: string) {
	const error = new Error(message);
	attachSpawnFailureDiagnostics(error);
	return { error, diagnostics: readErrorDiagnostics(error) };
}

describe("attachSpawnFailureDiagnostics", () => {
	test("spawn refused outright → descriptor table recorded", () => {
		// Verbatim from HOST-SERVICE-4E / HOST-SERVICE-1R: child_process throws
		// synchronously for EBADF, and simple-git keeps only String(err).
		const { diagnostics } = diagnose("Error: spawn EBADF");
		expect(diagnostics).toBeDefined();
		// The count stays strict: both shipped platforms always let a process
		// list its own descriptor table, so anything but a positive number here
		// means the counter stopped working.
		expect(diagnostics?.open_file_descriptors).toBeGreaterThan(0);
		// The limit is the one that genuinely varies — a container with no cap
		// reports it as "unlimited", which is a fact worth recording, not a
		// failure. Anything else would be.
		const limit = diagnostics?.file_descriptor_soft_limit;
		expect(
			limit === "unlimited" || (typeof limit === "number" && limit > 0),
		).toBe(true);
	});

	test("spawn refused via the child's error event → recorded too", () => {
		// EACCES/EAGAIN/EMFILE/ENFILE/ENOENT reach the child's error event
		// instead of throwing, and simple-git puts err.stack on stderr. First
		// line verbatim from the same trpc_path (releases 1.22.0 and 1.23.0);
		// frames reproduced locally against a git binary that does not exist.
		// EMFILE arrives this way, so the exhaustion case must not be excluded
		// by the shape the message happens to take.
		const { diagnostics } = diagnose(
			"Error: spawn git EAGAIN\n" +
				"    at ChildProcess._handle.onexit (node:internal/child_process:285:19)\n" +
				"    at onErrorNT (node:internal/child_process:483:16)\n" +
				"    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)",
		);
		expect(diagnostics).toBeDefined();
		expect(diagnostics?.open_file_descriptors).toBeGreaterThan(0);
	});

	test("git ran and exited non-zero → nothing attached", () => {
		// Real traffic from git.getStatus in the same week as the spawn groups.
		// git started, did its work and refused: the descriptor table says
		// nothing about a damaged object store, and attaching it here would
		// turn the diagnostics into noise on the most common failures we see.
		expect(diagnose("fatal: bad object HEAD\n").diagnostics).toBeUndefined();
		expect(
			diagnose(
				"error: file .git/objects/pack/pack-816a419ea2792b300adb04c1f8bc739065981ebe.pack is far too short to be a packfile\n",
			).diagnostics,
		).toBeUndefined();
		expect(
			diagnose(
				"fatal: not a git repository (or any of the parent directories): .git\n",
			).diagnostics,
		).toBeUndefined();
	});

	test("a spawn failure inside git's output is not our spawn failing", () => {
		// The over-match this branch has to refuse: a clean filter that is
		// itself a Node program crashes on its own spawn, and git relays the
		// crash dump. Our spawn succeeded — git ran, and its stderr is
		// quoting someone else's failure. Modelled on the filter failures in
		// classify-git-error.test.ts, which are real traffic from this path.
		expect(
			diagnose(
				"node:internal/child_process:421\n" +
					"    throw errnoException(err, 'spawn');\n" +
					"    ^\n\n" +
					"Error: spawn image-optimiser ENOENT\n" +
					"    at ChildProcess.spawn (node:internal/child_process:421:11)\n" +
					"error: external filter 'media-filter' failed\n" +
					"fatal: assets/img/hash.png: clean filter 'media' failed\n",
			).diagnostics,
		).toBeUndefined();
	});

	test("leaves the error itself alone", () => {
		const { error } = diagnose("Error: spawn EBADF");
		expect(error.message).toBe("Error: spawn EBADF");
		expect(Object.keys(error)).toEqual([]);
	});
});
