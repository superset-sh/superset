/**
 * The boot-twice test: the locally built image (`bun run image --local`)
 * must boot as a box would, and a second boot must install nothing, fetch
 * nothing and skip every step. Runs the real superset-boot in a container
 * with a stub identity the way the control plane does through the sandbox
 * API (the identity written as a file, then boot as the image user through
 * sudo with the secret preserved from the command's env), then reads the
 * boot log and the step markers.
 *
 *   bun run src/boot-twice.ts            expects superset-sandbox:local
 *   SANDBOX_IMAGE=... bun run src/boot-twice.ts
 *
 * Exits non-zero on any failed expectation, with the boot log printed.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	renderSandboxConf,
	SANDBOX_PATHS,
	SANDBOX_PORTS,
} from "@superset/shared/sandbox-contract";
import { PACKAGE_ROOT } from "./build";

const IMAGE = process.env.SANDBOX_IMAGE ?? "superset-sandbox:local";
const NAME = `superset-boot-twice-${Date.now().toString(36)}`;
const bundleSha = readFileSync(
	join(PACKAGE_ROOT, "dist", "bundle.sha256"),
	"utf8",
).trim();

function docker(
	args: string[],
	opts: { stdin?: string; check?: boolean } = {},
): string {
	const proc = Bun.spawnSync(["docker", ...args], {
		stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = new TextDecoder().decode(proc.stdout);
	if (opts.check !== false && proc.exitCode !== 0) {
		throw new Error(
			`docker ${args.slice(0, 2).join(" ")} failed (${proc.exitCode}): ${new TextDecoder().decode(proc.stderr)}`,
		);
	}
	return out;
}
const exec = (cmd: string, opts: { user?: string; check?: boolean } = {}) =>
	docker(
		["exec", ...(opts.user ? ["-u", opts.user] : []), NAME, "bash", "-lc", cmd],
		{ check: opts.check },
	);

/**
 * The way the control plane starts boot: as the image user, through sudo
 * with the secret preserved from the command's env, never on the argv.
 */
function bootAsUser(): string {
	const proc = Bun.spawnSync(
		[
			"docker",
			"exec",
			"-u",
			"ubuntu",
			"-e",
			"HOST_SERVICE_SECRET=boot-twice-secret",
			NAME,
			"sudo",
			"--preserve-env=HOST_SERVICE_SECRET",
			"/usr/local/bin/superset-boot",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}exit=${proc.exitCode}`;
}

const failures: string[] = [];
function expect(label: string, ok: boolean, detail = ""): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
	if (!ok) failures.push(label);
}

const identity = renderSandboxConf({
	SUPERSET_SANDBOX_CONTRACT: "1",
	SUPERSET_BUNDLE_SHA: bundleSha,
	SUPERSET_API_URL: "https://api.example.invalid",
	SUPERSET_SANDBOX_WORKSPACE_ID: randomUUID(),
	SUPERSET_SANDBOX_ORGANIZATION_ID: randomUUID(),
	SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
		{
			url: "https://github.com/superset-sh/superset.git",
			branch: "main",
			path: ".",
		},
	]),
	SUPERSET_SANDBOX_IMAGE_TAG: IMAGE,
	SUPERSET_SANDBOX_PROVIDER: "docker",
});

docker(["rm", "-f", NAME], { check: false });
// Privileged for the /dev/shm remount and the X socket dir, like the VM. No
// network policy here; the checkout needs the internet.
docker([
	"run",
	"-d",
	"--name",
	NAME,
	"--platform",
	"linux/amd64",
	"--privileged",
	"--user",
	"root",
	IMAGE,
	"sleep",
	"infinity",
]);
try {
	// The identity file, the way the control plane writes it before boot.
	docker(["exec", "-i", NAME, "bash", "-c", `cat > ${SANDBOX_PATHS.conf}`], {
		stdin: identity,
	});
	const boot = (_n: number) => {
		const started = Date.now();
		bootAsUser();
		// Wait for host-service (up to 60 s) so the second boot sees a clean run dir cleared by the first.
		exec(
			`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/host-service.ready ] && exit 0; sleep 0.1; done; exit 1`,
			{ check: false },
		);
		return Date.now() - started;
	};

	const first = boot(1);
	const log1 = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	// The image may have been built from an older bundle than the one the
	// test pins; the first boot then exercises the update path and must land
	// on the pin either way.
	expect(
		"first boot: bundle is the pinned one",
		new RegExp(`bundle\\.(current|installed) ${bundleSha.slice(0, 12)}`).test(
			log1,
		),
		log1.match(/bundle .*/)?.[0],
	);
	expect(
		"first boot: no step failed",
		!/step \S+ FAILED/.test(log1),
		(log1.match(/step \S+ FAILED.*/g) ?? []).join(", "),
	);
	expect(
		"first boot: host-service ready",
		/host\.ready/.test(log1),
		`${first} ms to ready`,
	);
	expect(
		"host-service listens on its port",
		/200/.test(
			exec(
				`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/trpc/health.check`,
				{ check: false },
			),
		),
	);
	expect(
		"host-service refuses without the secret",
		/401/.test(
			exec(
				`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/events`,
				{ check: false },
			),
		),
	);
	expect(
		"host-service runs as ubuntu",
		/^ubuntu$/m.test(
			exec(`ps -o user= -p $(cat ${SANDBOX_PATHS.run}/host-service.pid)`, {
				check: false,
			}),
		),
	);
	expect(
		"pid, ready flags and the pty socket live in /run/superset",
		/host-service\.pid[\s\S]*host-service\.ready/.test(
			exec(`ls ${SANDBOX_PATHS.run} | sort | tr '\\n' ' '`),
		),
		exec(`ls ${SANDBOX_PATHS.run} | tr '\\n' ' '`).trim(),
	);
	const display = exec(
		`for i in $(seq 1 300); do [ -f ${SANDBOX_PATHS.run}/display.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
		{ check: false },
	);
	expect("desktop: X ready", /ready/.test(display));
	expect(
		"desktop: websockify listening",
		/LISTEN/.test(
			exec(`ss -ltn | grep ':${SANDBOX_PORTS.desktop} '`, { check: false }),
		),
	);
	expect(
		"desktop: session bus address written for terminals",
		/DBUS_SESSION_BUS_ADDRESS=unix/.test(
			exec(`cat ${SANDBOX_PATHS.run}/desktop.env`, { check: false }),
		),
	);
	expect(
		"desktop: window manager up",
		/window id/.test(
			exec(
				`for i in $(seq 1 240); do DISPLAY=:1 xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && DISPLAY=:1 xprop -root _NET_SUPPORTING_WM_CHECK && exit 0; sleep 0.25; done`,
				{ check: false, user: "ubuntu" },
			),
		),
	);
	// The control plane's push, so the runner's hook sequencing runs: this
	// checkout declares no start hook, which the log must say.
	exec(
		`curl -fs -X POST -H 'Authorization: Bearer boot-twice-secret' -H 'Content-Type: application/json' -d '{"json":{"variables":{"FOO":"bar"}}}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/trpc/sandbox.setEnvironment`,
		{ check: false },
	);
	expect(
		"start hook: the runner asked host-service once the push landed",
		/hook\.(none|started)/.test(
			exec(
				`for i in $(seq 1 600); do grep -qE 'hook.' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
				{ check: false },
			),
		),
	);
	expect(
		"no secret on disk",
		!/boot-twice-secret/.test(
			exec(
				`grep -rl boot-twice-secret /etc /var/lib/superset /opt/superset /home 2>/dev/null || true`,
			),
		),
	);
	expect(
		"status prints every step current",
		!/pending|never run|failed/.test(
			exec(`${SANDBOX_PATHS.bundleRoot}/current/setup status`),
		),
		exec(
			`${SANDBOX_PATHS.bundleRoot}/current/setup status | tail -n +2 | awk '{print $1":"$4}' | tr '\\n' ' '`,
		).trim(),
	);

	// The clone outlives host-service's readiness; a wake that interrupts it
	// is its own case (the runner reclones), not this test's.
	expect(
		"first boot: checkout done",
		/ready/.test(
			exec(
				`for i in $(seq 1 1200); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
				{ check: false },
			),
		),
	);
	// Second boot: stop everything the way a wake would (no processes survive), then boot again.
	exec(
		`pkill -u ubuntu -TERM || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}`,
		{ check: false },
	);
	exec(`: > ${SANDBOX_PATHS.bootLog}`);
	const second = boot(2);
	const log2 = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	expect("second boot: run dir cleared", /run\.cleared/.test(log2));
	expect(
		"second boot: nothing installed",
		/apply-rootfs installed=0/.test(log2),
	);
	expect("second boot: nothing fetched", !/fetched \//.test(log2));
	expect("second boot: every step skipped", !/step \S+ running/.test(log2));
	expect(
		"second boot: host-service ready",
		/host\.ready/.test(log2),
		`${second} ms to ready`,
	);
	expect(
		"second boot: checkout marker respected",
		/checkout\.(skipped|fetched|cloned)/.test(log2),
		log2.match(/checkout\..*/)?.[0],
	);
	console.log(`\nboot log (second boot):\n${log2}`);

	// Third boot, with host-service deliberately broken: the box must stay
	// alive, the desktop must still come up, and the log must say so.
	exec(
		`pkill -u ubuntu -TERM || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}`,
		{ check: false },
	);
	exec(
		`: > ${SANDBOX_PATHS.bootLog}; mv ${SANDBOX_PATHS.hostRoot}/current/host-service.js ${SANDBOX_PATHS.hostRoot}/current/host-service.js.broken`,
	);
	const brokenExit = bootAsUser();
	expect("broken host-service: boot exits 0", /exit=0/.test(brokenExit));
	expect(
		"broken host-service: desktop still comes up",
		/ready/.test(
			exec(
				`for i in $(seq 1 300); do [ -f ${SANDBOX_PATHS.run}/display.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
				{ check: false },
			),
		),
	);
	const log3 = exec(
		`for i in $(seq 1 700); do grep -qE 'host\\.(timeout|missing)' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
		{ check: false },
	);
	expect(
		"broken host-service: boot log names the failure",
		/host\.(timeout|missing)/.test(log3),
		log3.match(/host\.(timeout|missing).*/)?.[0],
	);
	expect(
		"broken host-service: no ready flag",
		!/host-service\.ready/.test(
			exec(`ls ${SANDBOX_PATHS.run}`, { check: false }),
		),
	);
} finally {
	docker(["rm", "-f", NAME], { check: false });
}
if (failures.length) {
	console.error(
		`\n${failures.length} expectation(s) failed: ${failures.join("; ")}`,
	);
	process.exit(1);
}
console.log("\nboot-twice: all expectations met");
