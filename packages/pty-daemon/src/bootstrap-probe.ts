// Detects whether the current process's macOS Mach bootstrap namespace is
// intact — i.e. whether per-user XPC services are reachable. A daemon that
// lost its bootstrap (updater relaunch, dead login-session port after
// logout/login, launch from a non-Aqua context) spawns PTYs where:
//
//  - Security.framework can't reach `com.apple.trustd`, so Go binaries like
//    `gh` fail TLS with `x509: OSStatus -26276`, and
//  - libinfo can't reach `opendirectoryd`, so getpwuid() falls back to the
//    flat /etc/passwd (system accounts only) and `id -un` prints the bare
//    uid while ssh reports "No user exists for uid 501".
//
// Both are the same failure (lost bootstrap), but either service can be
// individually flaky, so we probe both and report degraded when either is
// definitively broken. Node/curl can't stand in for the trustd probe: they
// use their own TLS stacks and succeed even when trustd is unreachable.
// `security verify-cert` DOES exercise the platform verifier, and
// os.userInfo() calls getpwuid_r directly — those are the reliable probes.
//
// The subprocess probe is async on purpose: the daemon runs it after binding
// its socket (possibly with live sessions adopted via handoff), and a sync
// spawn would stall every session's IO — see no-daemon-loop-blocking.test.ts.

import { spawn } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const SYSTEM_CERT_BUNDLE = "/etc/ssl/cert.pem";
const BEGIN = "-----BEGIN CERTIFICATE-----";
const END = "-----END CERTIFICATE-----";

export interface ProbeRunResult {
	status: number | null;
	error?: Error;
}

export interface BootstrapProbeDeps {
	platform?: NodeJS.Platform;
	/** Runs a command; resolves with spawnSync-like status/error. */
	run?: (
		cmd: string,
		args: string[],
	) => ProbeRunResult | Promise<ProbeRunResult>;
	/** Reads the system CA bundle (source of a known-good cert to verify). */
	readBundle?: () => string | Promise<string>;
	tmpDir?: string;
	/** getpwuid-backed identity lookup; mirrors os.userInfo(). */
	userInfo?: () => { username: string };
	uid?: number;
}

// Bounded so a wedged `security` can't leave the probe pending forever; a
// real probe takes tens of milliseconds.
const PROBE_TIMEOUT_MS = 3_000;

function runCommand(cmd: string, args: string[]): Promise<ProbeRunResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: "ignore",
			timeout: PROBE_TIMEOUT_MS,
		});
		child.once("error", (error) => resolve({ status: null, error }));
		// A timeout kill surfaces as exit-by-signal → status null → inconclusive.
		child.once("exit", (code) => resolve({ status: code }));
	});
}

/**
 * True when the platform verifier (trustd) is reachable. macOS only — other
 * platforms have no such coupling and always return true. We only report
 * `false` on a clean non-zero exit from `security verify-cert`; any spawn
 * error, timeout, or signal death is inconclusive and reported healthy, so a
 * flaky probe never triggers an unwarranted (session-destroying) respawn.
 */
export async function probeTrustdReachable(
	deps: BootstrapProbeDeps = {},
): Promise<boolean> {
	const platform = deps.platform ?? process.platform;
	if (platform !== "darwin") return true;

	const run = deps.run ?? runCommand;

	let certDir: string | undefined;
	try {
		const bundle = deps.readBundle
			? await deps.readBundle()
			: await fsp.readFile(SYSTEM_CERT_BUNDLE, "utf8");
		const begin = bundle.indexOf(BEGIN);
		// Search for END only from BEGIN onward so a different earlier PEM type
		// (e.g. "BEGIN TRUSTED CERTIFICATE") whose END sits before the first
		// "BEGIN CERTIFICATE" can't produce a bogus slice.
		const end = bundle.indexOf(END, begin);
		if (begin === -1 || end === -1) return true;
		// A cert from the trust store verifies cleanly WHEN trustd is reachable,
		// so a non-zero exit isolates "trustd unreachable" from "bad cert".
		const cert = `${bundle.slice(begin, end + END.length)}\n`;
		// mkdtemp gives a fresh 0700 dir, so the cert path is unpredictable and
		// can't be pre-seeded as a symlink (TOCTOU) or collide across runs.
		certDir = await fsp.mkdtemp(
			path.join(deps.tmpDir ?? os.tmpdir(), "superset-trustd-"),
		);
		const certPath = path.join(certDir, "probe.pem");
		await fsp.writeFile(certPath, cert, { mode: 0o600 });
		const result = await run("security", ["verify-cert", "-c", certPath]);
		if (result.error) return true; // spawn failed / timed out → inconclusive
		if (typeof result.status !== "number") return true; // killed by signal
		return result.status === 0;
	} catch {
		return true;
	} finally {
		if (certDir) {
			try {
				await fsp.rm(certDir, { recursive: true, force: true });
			} catch {
				// best-effort
			}
		}
	}
}

/**
 * True when getpwuid() resolves our own uid to a username. macOS only. When
 * opendirectoryd is unreachable, libinfo falls back to /etc/passwd, which has
 * no uid-501 entry — os.userInfo() then throws (getpwuid_r finds nothing) or,
 * on some paths, surfaces the bare uid as the name. Either is the exact
 * condition users see as `id -un` → `501` and ssh's "No user exists for uid".
 * In-process and syscall-backed, so there's no subprocess to flake.
 */
export function probeUserResolutionHealthy(
	deps: BootstrapProbeDeps = {},
): boolean {
	const platform = deps.platform ?? process.platform;
	if (platform !== "darwin") return true;
	const uid =
		deps.uid ??
		(typeof process.getuid === "function" ? process.getuid() : undefined);
	try {
		const info = deps.userInfo ? deps.userInfo() : os.userInfo();
		if (!info.username) return false;
		return uid === undefined || info.username !== String(uid);
	} catch {
		return false;
	}
}

/**
 * Combined bootstrap-namespace health: trustd reachable AND our uid resolves
 * to a username. Reported in the daemon's hello-ack so the supervisor can
 * heal a degraded daemon. Always true off darwin.
 */
export async function probeBootstrapHealthy(
	deps: BootstrapProbeDeps = {},
): Promise<boolean> {
	if (!probeUserResolutionHealthy(deps)) return false;
	return probeTrustdReachable(deps);
}
