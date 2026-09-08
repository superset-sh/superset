import { describe, expect, test } from "bun:test";
import { redactCrashTail } from "./host-service-utils";

/**
 * A tail shaped like the ones host-service crashes actually attach: worktree
 * paths under the user's home, then the V8 fatal error and its native frames.
 */
const CRASH_TAIL = [
	"[host-service:pull-request-runtime] Worktree missing on disk; pausing branch sync until it reappears {",
	"  worktreePath: '/Users/ada/.superset/worktrees/de7ee5cf/rift-menu'",
	"}",
	"[workspace-fs/watch] nested-repo scan hit cap { absolutePath: '/Users/ada/Desktop/flow', found: 3 }",
	"",
	"<--- Last few GCs --->",
	"",
	"FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory",
	"----- Native stack trace -----",
	" 1: 0x1124c7d38 node::OOMErrorHandler(char const*, v8::OOMDetails const&) [/Applications/Superset.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework]",
	"26: 0x1124d5240 node::fs::AfterScanDir(uv_fs_s*) [/Applications/Superset.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework]",
	"36: 0x184983da4 start [/usr/lib/dyld]",
].join("\n");

describe("redactCrashTail", () => {
	test("returns the tail unchanged when there is nothing to redact", () => {
		expect(redactCrashTail(CRASH_TAIL)).toBe(CRASH_TAIL);
	});

	describe("home directory", () => {
		test("replaces every occurrence with ~, keeping the rest of the path", () => {
			const redacted = redactCrashTail(CRASH_TAIL, { homeDir: "/Users/ada" });

			expect(redacted).not.toContain("/Users/ada");
			expect(redacted).toContain("~/.superset/worktrees/de7ee5cf/rift-menu");
			expect(redacted).toContain("~/Desktop/flow");
		});

		test("keeps the diagnosis: fatal error, native frames, system paths", () => {
			const redacted = redactCrashTail(CRASH_TAIL, { homeDir: "/Users/ada" });

			expect(redacted).toContain(
				"FATAL ERROR: Ineffective mark-compacts near heap limit",
			);
			expect(redacted).toContain("node::fs::AfterScanDir(uv_fs_s*)");
			expect(redacted).toContain("/Applications/Superset.app/Contents");
			expect(redacted).toContain("[/usr/lib/dyld]");
			expect(redacted).toContain(
				"[workspace-fs/watch] nested-repo scan hit cap",
			);
		});

		// The tail is the only evidence a hard kill leaves. A home directory that
		// is a filesystem root matches nearly every absolute path in it, so
		// substituting it would replace the diagnosis along with the name.
		test("ignores a root home directory rather than shredding the tail", () => {
			for (const root of ["/", "C:\\", ""]) {
				expect(redactCrashTail(CRASH_TAIL, { homeDir: root })).toBe(CRASH_TAIL);
			}
		});
	});

	describe("secrets", () => {
		test("replaces each secret with [redacted]", () => {
			const tail = "auth=tok-abc bridge=br-xyz then tok-abc again";

			expect(redactCrashTail(tail, { secrets: ["tok-abc", "br-xyz"] })).toBe(
				"auth=[redacted] bridge=[redacted] then [redacted] again",
			);
		});

		// `"".split("")` splits between every character, so an empty secret would
		// turn the tail into [redacted] separators and nothing else.
		test("ignores an empty secret rather than shredding the tail", () => {
			expect(redactCrashTail(CRASH_TAIL, { secrets: [""] })).toBe(CRASH_TAIL);
		});

		test("redacts secrets and the home directory together", () => {
			const redacted = redactCrashTail(
				"/Users/ada/x told tok-abc to /Users/ada/y",
				{ secrets: ["tok-abc"], homeDir: "/Users/ada" },
			);

			expect(redacted).toBe("~/x told [redacted] to ~/y");
		});
	});
});
