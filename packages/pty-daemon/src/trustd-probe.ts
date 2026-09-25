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

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
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
	/** Runs a command; status = exit code, null when it never exited cleanly. */
	run?: (
		cmd: string,
		args: string[],
	) => TrustdProbeResult | Promise<TrustdProbeResult>;
	/** Reads the system CA bundle (source of a known-good cert to verify). */
	readBundle?: () => string | Promise<string>;
	tmpDir?: string;
}

// Bounded so a wedged `security` can't leave the hello-ack reporting
// "unknown" forever; a real probe takes tens of milliseconds.
const PROBE_TIMEOUT_MS = 3_000;

/**
 * An inconclusive probe fails open (healthy) so it can never trigger a
 * session-destroying respawn — but persistent breakage (missing CA bundle,
 * unspawnable `security`) must not be silently indistinguishable from a
 * healthy system in logs.
 */
function warnInconclusive(detail: string): void {
	process.stderr.write(
		`[trustd-probe] inconclusive, failing open as healthy: ${detail}\n`,
	);
}

/** Async execFile mirrored into spawnSync-style {status, error}. */
function runCommand(cmd: string, args: string[]): Promise<TrustdProbeResult> {
	return new Promise((resolve) => {
		execFile(cmd, args, { timeout: PROBE_TIMEOUT_MS }, (error) => {
			if (!error) {
				resolve({ status: 0 });
				return;
			}
			// Clean non-zero exit carries a numeric code; a spawn failure carries
			// a string code (e.g. ENOENT) and a timeout/signal death sets killed.
			const { code } = error as { code?: number | string };
			if (typeof code === "number" && !error.killed) {
				resolve({ status: code });
				return;
			}
			resolve({ status: null, error });
		});
	});
}

/**
 * True when the platform verifier (trustd) is reachable. macOS only — other
 * platforms have no such coupling and always return true. We only report
 * `false` on a clean non-zero exit from `security verify-cert`; any spawn
 * error, timeout, or signal death is inconclusive and reported healthy, so a
 * flaky probe never triggers an unwarranted (session-destroying) respawn.
 */
export async function probeTrustdHealthy(
	deps: TrustdProbeDeps = {},
): Promise<boolean> {
	const platform = deps.platform ?? process.platform;
	if (platform !== "darwin") return true;

	const run = deps.run ?? runCommand;

	let certDir: string | undefined;
	try {
		const bundle = deps.readBundle
			? await deps.readBundle()
			: await fs.readFile(SYSTEM_CERT_BUNDLE, "utf8");
		const begin = bundle.indexOf(BEGIN);
		// Search for END only from BEGIN onward so a different earlier PEM type
		// (e.g. "BEGIN TRUSTED CERTIFICATE") whose END sits before the first
		// "BEGIN CERTIFICATE" can't produce a bogus slice.
		const end = bundle.indexOf(END, begin);
		if (begin === -1 || end === -1) {
			warnInconclusive("no certificate found in system CA bundle");
			return true;
		}
		// A cert from the trust store verifies cleanly WHEN trustd is reachable,
		// so a non-zero exit isolates "trustd unreachable" from "bad cert".
		const cert = `${bundle.slice(begin, end + END.length)}\n`;
		// mkdtemp gives a fresh 0700 dir, so the cert path is unpredictable and
		// can't be pre-seeded as a symlink (TOCTOU) or collide across runs.
		certDir = await fs.mkdtemp(
			path.join(deps.tmpDir ?? os.tmpdir(), "superset-trustd-"),
		);
		const certPath = path.join(certDir, "probe.pem");
		await fs.writeFile(certPath, cert, { mode: 0o600 });
		const result = await run("security", ["verify-cert", "-c", certPath]);
		if (result.error) {
			// spawn failed / timed out → inconclusive
			warnInconclusive(`security did not run cleanly: ${result.error.message}`);
			return true;
		}
		if (typeof result.status !== "number") {
			// killed by signal
			warnInconclusive("security was killed by a signal");
			return true;
		}
		return result.status === 0;
	} catch (err) {
		warnInconclusive((err as Error).message);
		return true;
	} finally {
		if (certDir) {
			// best-effort
			await fs.rm(certDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
