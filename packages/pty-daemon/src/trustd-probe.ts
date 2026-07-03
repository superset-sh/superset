// Detects whether the current process's macOS Mach bootstrap can reach
// `com.apple.trustd` — i.e. whether Security-framework TLS trust evaluation
// works. When it can't (a degraded bootstrap: updater relaunch, a dead
// login-session port after logout/login, etc.), Go binaries like `gh` fail
// with `x509: OSStatus -26276` and headless Chromium aborts with
// `bootstrap_check_in error 141`.
//
// Node/curl can't detect this: they use their own TLS stack, not Secure
// Transport, so they succeed even when trustd is unreachable. `security
// verify-cert` DOES exercise the platform verifier — exit 0 when trustd is
// reachable, non-zero when it isn't — so it's the reliable probe.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SYSTEM_CERT_BUNDLE = "/etc/ssl/cert.pem";
const BEGIN = "-----BEGIN CERTIFICATE-----";
const END = "-----END CERTIFICATE-----";

export interface TrustdProbeResult {
	status: number | null;
	error?: Error;
}

export interface TrustdProbeDeps {
	platform?: NodeJS.Platform;
	/** Runs a command; mirrors spawnSync's status/error. */
	run?: (cmd: string, args: string[]) => TrustdProbeResult;
	/** Reads the system CA bundle (source of a known-good cert to verify). */
	readBundle?: () => string;
	tmpDir?: string;
	pid?: number;
}

// Bounded so a wedged `security` can't stall daemon startup (the probe runs
// before the socket binds). Comfortably under the supervisor's socket-ready
// timeout; a real probe takes tens of milliseconds.
const PROBE_TIMEOUT_MS = 3_000;

/**
 * True when the platform verifier (trustd) is reachable. macOS only — other
 * platforms have no such coupling and always return true. We only report
 * `false` on a clean non-zero exit from `security verify-cert`; any spawn
 * error, timeout, or signal death is inconclusive and reported healthy, so a
 * flaky probe never triggers an unwarranted (session-destroying) respawn.
 */
export function probeTrustdHealthy(deps: TrustdProbeDeps = {}): boolean {
	const platform = deps.platform ?? process.platform;
	if (platform !== "darwin") return true;

	const run =
		deps.run ??
		((cmd: string, args: string[]) =>
			spawnSync(cmd, args, { timeout: PROBE_TIMEOUT_MS }));

	let certPath: string | undefined;
	try {
		const bundle = deps.readBundle
			? deps.readBundle()
			: fs.readFileSync(SYSTEM_CERT_BUNDLE, "utf8");
		const begin = bundle.indexOf(BEGIN);
		const end = bundle.indexOf(END);
		if (begin === -1 || end === -1 || end < begin) return true;
		// A cert from the trust store verifies cleanly WHEN trustd is reachable,
		// so a non-zero exit isolates "trustd unreachable" from "bad cert".
		const cert = `${bundle.slice(begin, end + END.length)}\n`;
		certPath = path.join(
			deps.tmpDir ?? os.tmpdir(),
			`superset-trustd-probe-${deps.pid ?? process.pid}.pem`,
		);
		fs.writeFileSync(certPath, cert, { mode: 0o600 });
		const result = run("security", ["verify-cert", "-c", certPath]);
		if (result.error) return true; // spawn failed / timed out → inconclusive
		if (typeof result.status !== "number") return true; // killed by signal
		return result.status === 0;
	} catch {
		return true;
	} finally {
		if (certPath) {
			try {
				fs.unlinkSync(certPath);
			} catch {
				// best-effort
			}
		}
	}
}
