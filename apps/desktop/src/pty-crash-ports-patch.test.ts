import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on node-pty (patches/README.md). patchedDependencies is
// keyed to an exact version, so a version bump silently drops the patch while
// everything still builds — and the symptom is a slow flood of other people's
// crashes into our Sentry project, not a build failure. If this fails after a
// bump, regenerate the patch per patches/README.md; do NOT delete the test.
describe("node-pty pty crash-handler patch", () => {
	// node-pty's loader resolves the native dir next to lib/, and spawn-helper is
	// built from this source by the node-gyp rebuild in `bun run install:deps`.
	const source = readFileSync(
		join(
			dirname(require.resolve("node-pty")),
			"..",
			"src",
			"unix",
			"spawn-helper.cc",
		),
		"utf8",
	);

	test("spawn-helper clears inherited Mach exception ports before exec", () => {
		expect(source).toContain("task_set_exception_ports(mach_task_self()");
	});

	test("it clears the masks Crashpad registers, not EXC_MASK_ALL", () => {
		// EXC_MASK_ALL excludes EXC_MASK_CRASH, so using it here would compile,
		// run, and silently fail to detach the crash handler.
		const code = source.replace(/\/\/[^\n]*/g, "");
		expect(code).toContain(
			"EXC_MASK_CRASH | EXC_MASK_RESOURCE | EXC_MASK_GUARD",
		);
		expect(code).not.toContain("EXC_MASK_ALL");
	});

	test("it clears the ports, rather than pointing them somewhere", () => {
		expect(source).toContain("MACH_PORT_NULL");
	});

	test("the clear runs before execvp, not after", () => {
		const clear = source.indexOf("task_set_exception_ports");
		const exec = source.indexOf("execvp(");
		expect(clear).toBeGreaterThan(-1);
		expect(exec).toBeGreaterThan(-1);
		expect(clear).toBeLessThan(exec);
	});

	// node-pty loads spawn-helper from the first of build/Release, build/Debug,
	// prebuilds/<platform>-<arch>. Only the first two are built from the patched
	// source; falling through to the bundled prebuild would ship an unpatched
	// helper and the fix would vanish with nothing failing. Skipped where the
	// native rebuild has not run (CI test jobs install with --ignore-scripts).
	const built = join(
		dirname(require.resolve("node-pty")),
		"..",
		"build",
		"Release",
		"spawn-helper",
	);
	test.skipIf(process.platform !== "darwin" || !existsSync(built))(
		"the built spawn-helper is the patched one",
		() => {
			expect(Bun.spawnSync(["nm", "-u", built]).stdout.toString()).toContain(
				"_task_set_exception_ports",
			);
		},
	);
});
