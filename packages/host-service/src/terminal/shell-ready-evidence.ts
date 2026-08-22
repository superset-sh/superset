/**
 * Learned, per-machine evidence of whether shell launches actually deliver
 * the OSC 133;A readiness marker to the PTY stream.
 *
 * `shellLaunchExpectsReadyMarker` is a static file check: wrapper files on
 * disk say the marker *should* fire, but a user profile can keep it from ever
 * reaching the scanner (exec-ing tmux or another shell from .zshrc, a
 * framework clearing precmd hooks, …). On such machines every marker-gated
 * launch used to ride the full 15s fallback (SUPER-1103). Recording what the
 * scanner actually observed lets later launches size their wait to reality:
 * `missing` machines drop to a short grace, and the first observed marker
 * flips the record back to `delivered`.
 *
 * Persisted as a tiny JSON map keyed by shell basename in
 * `$SUPERSET_HOME_DIR/shell-ready-evidence.json` so the knowledge survives
 * host-service restarts. Writes are best-effort; per-org host-service
 * processes share the file and last-write-wins is fine — they observe the
 * same machine and shell.
 */
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup/paths";

export type ShellReadyEvidence = "delivered" | "missing";

const EVIDENCE_FILENAME = "shell-ready-evidence.json";

type EvidenceMap = Record<string, ShellReadyEvidence>;

let cache: { dir: string; evidence: EvidenceMap } | null = null;
let warnedReadError = false;

function evidenceDir(): string {
	return resolveSupersetHomeDir();
}

function loadEvidence(dir: string): EvidenceMap {
	if (cache && cache.dir === dir) return cache.evidence;
	let evidence: EvidenceMap = {};
	if (dir) {
		try {
			const raw: unknown = JSON.parse(
				readFileSync(path.join(dir, EVIDENCE_FILENAME), "utf8"),
			);
			if (raw && typeof raw === "object") {
				for (const [shell, value] of Object.entries(raw)) {
					if (value === "delivered" || value === "missing") {
						evidence[shell] = value;
					}
				}
			}
		} catch (error) {
			evidence = {};
			// No file yet and a corrupt file both legitimately mean "no
			// evidence"; anything else (EACCES, EISDIR, …) is a real problem
			// that silently costs a 15s wait per launch — say so once.
			const code = (error as NodeJS.ErrnoException)?.code;
			if (code !== "ENOENT" && !(error instanceof SyntaxError)) {
				if (!warnedReadError) {
					warnedReadError = true;
					console.warn("[terminal] failed to read shell-ready evidence", {
						error,
					});
				}
			}
		}
	}
	cache = { dir, evidence };
	return evidence;
}

export function getShellReadyMarkerEvidence(
	shellName: string,
): ShellReadyEvidence | null {
	return loadEvidence(evidenceDir())[shellName] ?? null;
}

export function recordShellReadyMarkerEvidence(
	shellName: string,
	evidence: ShellReadyEvidence,
): void {
	const dir = evidenceDir();
	const map = loadEvidence(dir);
	if (map[shellName] === evidence) return;
	map[shellName] = evidence;
	if (!dir) return;
	// Write-then-rename so concurrent readers (per-org host-service
	// processes share this file) never see a torn write.
	const target = path.join(dir, EVIDENCE_FILENAME);
	const tmp = `${target}.${process.pid}.tmp`;
	void writeFile(tmp, `${JSON.stringify(map, null, "\t")}\n`)
		.then(() => rename(tmp, target))
		.catch(() => {
			// Best-effort persistence: the in-memory record still governs this
			// process; a failed write only costs one 15s wait after a restart.
		});
}

export function __resetShellReadyEvidenceForTesting(): void {
	cache = null;
	warnedReadError = false;
}
