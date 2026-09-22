/**
 * The runner's own behaviour, exercised against a synthetic bundle in the
 * locally built image (`bun run image --local`): apply-rootfs installs then
 * skips, sync-assets verifies and refuses a bad hash, run-steps skips on a
 * matching marker, and the fail-open wrapper records the sentinel, skips
 * downstream, disables after three failures, clears on success and always
 * exits 0.
 *
 *   bun run src/runner-check.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	renderContractShell,
	SANDBOX_PATHS,
} from "@superset/shared/sandbox-contract";
import { PACKAGE_ROOT } from "./build";
import { sha256 } from "./manifest";

const IMAGE = process.env.SANDBOX_IMAGE ?? "superset-sandbox:local";
const NAME = `superset-runner-check-${Date.now().toString(36)}`;
const b64 = (s: string) => Buffer.from(s).toString("base64");

const failures: string[] = [];
function expect(label: string, ok: boolean, detail = ""): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
	if (!ok) failures.push(label);
}
function docker(args: string[], check = true): string {
	const proc = Bun.spawnSync(["docker", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const out =
		new TextDecoder().decode(proc.stdout) +
		new TextDecoder().decode(proc.stderr);
	if (check && proc.exitCode !== 0)
		throw new Error(`docker ${args.slice(0, 2).join(" ")} failed: ${out}`);
	return out;
}
const sh = (cmd: string) => docker(["exec", NAME, "bash", "-lc", cmd], false);

// A bundle on disk: one rootfs file, two assets (one whose hash lies), three steps.
const dir = mkdtempSync(join(tmpdir(), "superset-runner-check-"));
const bundle = join(dir, "bundle");
mkdirSync(join(bundle, "rootfs/etc/superset"), { recursive: true });
mkdirSync(join(bundle, "steps"), { recursive: true });
mkdirSync(join(dir, "assets"), { recursive: true });
Bun.spawnSync([
	"cp",
	join(PACKAGE_ROOT, "bundle", "setup"),
	join(bundle, "setup"),
]);
// The contract, with the asset base pointed at a server inside the container.
writeFileSync(
	join(bundle, "rootfs/etc/superset/contract.sh"),
	renderContractShell().replace(
		/SUPERSET_ASSET_BASE_URL='[^']*'/,
		"SUPERSET_ASSET_BASE_URL='http://127.0.0.1:8099'",
	),
);
const marker = "hello from the rootfs\n";
mkdirSync(join(bundle, "rootfs/opt/check"), { recursive: true });
writeFileSync(join(bundle, "rootfs/opt/check/file"), marker);
writeFileSync(
	join(bundle, "tools.tsv"),
	`0644\t${sha256(marker)}\t${b64("rootfs/opt/check/file")}\t${b64("/opt/check/file")}\n` +
		`0644\t${sha256(renderContractShell())}\t${b64("rootfs/etc/superset/contract.sh")}\t${b64("/etc/superset/contract.sh")}\n`,
);
const good = "a good asset\n";
const goodSha = sha256(good);
writeFileSync(join(dir, "assets", `${goodSha}.txt`), good);
const liarSha = sha256("what the manifest claims\n");
writeFileSync(
	join(dir, "assets", `${liarSha}.txt`),
	"what is actually served\n",
);
writeFileSync(
	join(bundle, "assets.tsv"),
	`0644\t${goodSha}\t.txt\t${b64("/opt/check/good.txt")}\n0644\t${liarSha}\t.txt\t${b64("/opt/check/liar.txt")}\n`,
);
writeFileSync(
	join(bundle, "steps/first.sh"),
	"#!/bin/bash\necho first ran >> /opt/check/steps.log\n",
);
writeFileSync(
	join(bundle, "steps/flaky.sh"),
	"#!/bin/bash\necho flaky ran >> /opt/check/steps.log\n[ -f /opt/check/flaky-ok ] || exit 1\n",
);
writeFileSync(
	join(bundle, "steps/after.sh"),
	"#!/bin/bash\necho after ran >> /opt/check/steps.log\n",
);
writeFileSync(
	join(bundle, "steps.tsv"),
	"first\tv-first\nflaky\tv-flaky\nafter\tv-after\n",
);

docker(["rm", "-f", NAME], false);
docker([
	"run",
	"-d",
	"--name",
	NAME,
	"--platform",
	"linux/amd64",
	"--user",
	"root",
	"-v",
	`${dir}:/check:ro`,
	IMAGE,
	"sleep",
	"infinity",
]);
try {
	sh(
		"cp -R /check/bundle /bundle && chmod +x /bundle/setup /bundle/steps/*.sh && mkdir -p /opt/check && (cd /check/assets && nohup python3 -m http.server 8099 >/dev/null 2>&1 &) && sleep 1",
	);
	const steps = SANDBOX_PATHS.steps;

	// apply-rootfs: installs, then skips.
	// The image already carries this contract.sh with a matching sidecar.
	expect(
		"apply-rootfs installs the file",
		/installed=1 skipped=1/.test(sh("/bundle/setup apply-rootfs")) &&
			sh("cat /opt/check/file") === marker,
	);
	expect(
		"apply-rootfs skips on a matching sidecar",
		/installed=0 skipped=2/.test(sh("/bundle/setup apply-rootfs")),
	);
	sh("rm /opt/check/file");
	expect(
		"apply-rootfs reinstalls a file that went missing",
		/installed=1 skipped=1/.test(sh("/bundle/setup apply-rootfs")),
	);

	// sync-assets: fetches and verifies; refuses a lie; skips once installed.
	const sync1 = sh("/bundle/setup sync-assets; echo exit=$?");
	expect(
		"sync-assets installs the good asset",
		sh("cat /opt/check/good.txt") === good,
	);
	expect(
		"sync-assets refuses the asset whose bytes do not hash to the row",
		!/liar/.test(sh("ls /opt/check")) && !/exit=0/.test(sync1),
		sync1.trim().split("\n").pop(),
	);
	const sync2 = sh(
		"/bundle/setup sync-assets 2>&1 | grep -c 'fetched' || true",
	);
	expect(
		"sync-assets fetches nothing for an installed asset",
		!/good/.test(sh("/bundle/setup sync-assets 2>&1 | grep good || true")),
		sync2.trim(),
	);

	// A staged archive the manifest no longer names is pruned; one it names
	// stays. Sidecars are what make a file "staged": a bare file is left alone.
	const media = SANDBOX_PATHS.media;
	sh(
		`printf stale > ${media}/stale.bin && printf ${sha256("stale")} > ${media}/stale.bin.hash && printf keep > ${media}/keep.bin && printf ${goodSha} > ${media}/keep.bin.hash && printf loose > ${media}/loose.bin`,
	);
	const sync3 = sh("/bundle/setup sync-assets 2>&1 | grep pruned || true");
	expect(
		"sync-assets prunes a staged archive the manifest no longer lists",
		/stale\.bin/.test(sync3) &&
			sh(
				`ls ${media}/stale.bin ${media}/stale.bin.hash 2>&1 | grep -c 'No such'`,
			).trim() === "2",
		sync3.trim(),
	);
	expect(
		"sync-assets keeps a staged archive the manifest lists and a bare file",
		sh(
			`ls ${media}/keep.bin ${media}/keep.bin.hash ${media}/loose.bin | wc -l`,
		).trim() === "3",
	);

	// run-steps: fail-open.
	const run1 = sh("/bundle/setup run-steps; echo exit=$?");
	expect("run-steps exits 0 with a failing step", /exit=0/.test(run1));
	expect(
		"the failing step is recorded in the sentinel",
		/consecutiveFailures=1/.test(sh(`cat ${steps}/failure.env`)),
	);
	expect(
		"the step after the failure is skipped",
		/after ran/.test(sh("cat /opt/check/steps.log")) === false &&
			/downstream of failed flaky/.test(run1),
	);
	expect(
		"the step before it ran and is marked",
		/first ran/.test(sh("cat /opt/check/steps.log")) &&
			sh(`cat ${steps}/first.version`).trim() === "v-first",
	);
	const run2 = sh("/bundle/setup run-steps");
	expect(
		"a matching marker skips the step",
		/step first at v-first, skipping/.test(run2),
	);
	sh("/bundle/setup run-steps >/dev/null");
	expect(
		"three failures disable the step",
		/consecutiveFailures=3/.test(sh(`cat ${steps}/failure.env`)),
	);
	const run4 = sh("/bundle/setup run-steps");
	expect(
		"a disabled step is not retried and downstream stays skipped",
		/flaky skipped: flaky disabled after 3 failures/.test(run4) &&
			/after skipped/.test(run4),
		run4
			.trim()
			.split("\n")
			.filter((l) => /skipped/.test(l))
			.join(" | "),
	);
	expect(
		"status shows the failure",
		/flaky\s+v-flaky\s+failed x3/.test(sh("/bundle/setup status")),
		sh("/bundle/setup status | grep flaky").trim(),
	);
	expect(
		"an upstream step still runs while a later one is disabled",
		(() => {
			sh(
				"rm -f /opt/check/steps.log; sed -i 's/v-first/v-first-2/' /bundle/steps.tsv",
			);
			const out = sh("/bundle/setup run-steps");
			return (
				/first ran/.test(sh("cat /opt/check/steps.log")) &&
				/flaky skipped: flaky disabled/.test(out)
			);
		})(),
	);
	// A new version clears the sentinel; success clears it for good.
	sh(
		"sed -i 's/v-flaky/v-flaky-2/' /bundle/steps.tsv && touch /opt/check/flaky-ok",
	);
	const run5 = sh("/bundle/setup run-steps");
	expect(
		"a new version retries the step; success clears the sentinel and runs downstream",
		!/failure\.env/.test(sh(`ls ${steps}`)) &&
			/after ran/.test(sh("cat /opt/check/steps.log")),
		run5.trim().split("\n").pop(),
	);
	expect(
		"status shows every step current",
		!/pending|never run|failed/.test(sh("/bundle/setup status")),
	);
} finally {
	docker(["rm", "-f", NAME], false);
	rmSync(dir, { recursive: true, force: true });
}
if (failures.length) {
	console.error(
		`\n${failures.length} expectation(s) failed: ${failures.join("; ")}`,
	);
	process.exit(1);
}
console.log("\nrunner-check: all expectations met");
