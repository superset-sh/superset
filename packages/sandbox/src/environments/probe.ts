/**
 * What a person gets from a box: the checks a release runs against its
 * probe fork and the dispatch job runs against a fresh dev sandbox. Every
 * check talks to the box the way a client would (its published ports) or
 * the way the boot runner left it (its log and run directory).
 */
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import {
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	sandboxCheckoutDir,
} from "@superset/shared/sandbox-contract";
import { mintSandboxGateAccess } from "@superset/trpc/lib/sandbox";
import { Sandbox } from "@vercel/sandbox";

export interface ProbeArgs {
	name: string;
	credentials: { token: string; teamId: string; projectId: string };
	hostSecret: string;
	/** The bundle the box should be on; from the row or the build. */
	bundleSha?: string;
	branch: string;
	/** The primary repository's path under the workspace root. */
	primaryPath: string;
	/** True when the golden's setup installed the monorepo's dependencies. */
	expectDependencies?: boolean;
	/** Set when a brokered Anthropic rule is on the box's firewall. */
	expectAnthropicRule?: boolean;
	/** A gate to mint a ticket at; skipped when the secret is absent. */
	gate?: { workspaceId: string; userId: string } | null;
	log: (line: string) => void;
}

export async function probeBox(args: ProbeArgs): Promise<number> {
	const { log } = args;
	const sandbox = await Sandbox.get({
		...args.credentials,
		name: args.name,
		resume: false,
	});
	const host = sandbox.domain(SANDBOX_PORTS.hostService);
	let failed = 0;
	const check = (label: string, ok: boolean, detail = "") => {
		log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
		if (!ok) failed++;
	};
	const run = async (command: string): Promise<string> => {
		const result = await sandbox.runCommand("bash", ["-lc", command]);
		return `${await result.stdout()}${await result.stderr()}`;
	};
	const until = async (
		label: string,
		command: string,
		expect: RegExp,
		seconds: number,
	) => {
		for (let i = 0; i < seconds / 5; i++) {
			const out = await run(command);
			if (expect.test(out)) {
				check(label, true, out.trim().split("\n").pop());
				return true;
			}
			await new Promise((r) => setTimeout(r, 5000));
		}
		check(label, false);
		return false;
	};

	const status = (url: string, init?: RequestInit) =>
		fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
			.then((r) => r.status)
			.catch(() => 0);
	check(
		"host-service answers on its port",
		(await status(`${host}/trpc/health.check`)) === 200,
	);
	check(
		"host-service refuses without the secret",
		(await status(`${host}/events`)) === 401,
	);
	check(
		"host-service admits the secret",
		(await status(`${host}/trpc/health.check`, {
			headers: { authorization: `Bearer ${args.hostSecret}` },
		})) === 200,
	);

	const bootLog = await run(`cat ${SANDBOX_PATHS.bootLog}`);
	check(
		"boot: host-service ready",
		/host\.ready/.test(bootLog),
		bootLog.match(/host\.ready.*/)?.[0],
	);
	check(
		"boot: no step failed",
		!/step \S+ FAILED/.test(bootLog),
		(bootLog.match(/step \S+ FAILED.*/g) ?? []).join(", "),
	);
	if (args.bundleSha) {
		const short = args.bundleSha.slice(0, 12);
		check(
			"boot: on the pinned bundle",
			new RegExp(`bundle\\.(current|installed) ${short}`).test(bootLog),
			bootLog.match(/bundle\..*/)?.[0],
		);
	}
	check(
		"host-service runs as the sandbox user",
		/^ubuntu$/m.test(
			await run(`ps -o user= -p $(cat ${SANDBOX_PATHS.run}/host-service.pid)`),
		),
	);
	check(
		"no brokered credential in host-service's environment",
		/^0$/m.test(
			await run(
				`tr '\\0' '\\n' < /proc/$(cat ${SANDBOX_PATHS.run}/host-service.pid)/environ | grep -cE '^(ANTHROPIC_API_KEY|OPENAI_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|GH_TOKEN|GITHUB_TOKEN)=' || true`,
			),
		),
	);
	if (
		!(await until(
			"checkout on the branch",
			`git -C ${sandboxCheckoutDir(SANDBOX_PATHS.workspace, args.primaryPath)} rev-parse --abbrev-ref HEAD`,
			new RegExp(`^${args.branch}$`, "m"),
			300,
		))
	) {
		/* counted */
	}
	if (args.expectDependencies) {
		await until(
			"dependencies survive the fork",
			`test -d ${sandboxCheckoutDir(SANDBOX_PATHS.workspace, args.primaryPath)}/node_modules && echo ok`,
			/ok/,
			10,
		);
	}
	await until(
		"display, session and dock up",
		"pgrep -x Xvnc >/dev/null && pgrep -x xfce4-session >/dev/null && pgrep -x plank >/dev/null && echo up",
		/up/,
		90,
	);
	const rfb = await rfbHandshake(host, args.hostSecret);
	check(
		"desktop stream answers RFB through host-service",
		rfb.startsWith("RFB "),
		JSON.stringify(rfb),
	);
	if (args.expectAnthropicRule) {
		const models = (key: string) =>
			run(
				`curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'x-api-key: ${key}' -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models`,
			).then((code) => code.trim());
		const swapped = await models(SANDBOX_CREDENTIAL_PLACEHOLDER);
		check(
			"firewall swaps the Anthropic placeholder",
			swapped === "200",
			swapped,
		);
		const passed = await models("not-the-placeholder");
		check("firewall leaves another key alone", passed === "401", passed);
	}
	if (args.gate) {
		const access = await mintSandboxGateAccess({
			...args.gate,
			port: SANDBOX_PORTS.hostService,
			target: host,
		});
		check(
			"gate admits a ticket",
			(await status(`${access.url}/trpc/health.check`, {
				headers: { authorization: `Bearer ${access.token}` },
			})) === 200,
		);
		const forged = await status(`${access.url}/trpc/health.check`, {
			headers: { authorization: "Bearer forged" },
		});
		check(
			"gate refuses a forged ticket",
			forged === 401 || forged === 403,
			String(forged),
		);
		check(
			"gate refuses no ticket",
			(await status(`${access.url}/trpc/health.check`)) !== 200,
		);
	}
	return failed;
}

/** The second boot of a box: what a wake looks like in its log. */
export async function checkWakeLog(args: {
	name: string;
	credentials: ProbeArgs["credentials"];
	log: (line: string) => void;
}): Promise<number> {
	const sandbox = await Sandbox.get({
		...args.credentials,
		name: args.name,
		resume: false,
	});
	const result = await sandbox.runCommand("bash", [
		"-lc",
		`cat ${SANDBOX_PATHS.bootLog}`,
	]);
	const text = await result.stdout();
	const boots = text.split(/(?=^\d+ boot\.start)/m);
	const last = boots[boots.length - 1] ?? "";
	let failed = 0;
	const check = (label: string, ok: boolean) => {
		args.log(`${ok ? "ok  " : "FAIL"} ${label}`);
		if (!ok) failed++;
	};
	check("wake: run dir cleared", /run\.cleared/.test(last));
	check("wake: nothing installed", /apply-rootfs installed=0/.test(last));
	check("wake: nothing fetched", !/fetched \//.test(last));
	check("wake: every step skipped", !/step \S+ running/.test(last));
	check("wake: checkout kept", /checkout\.skipped/.test(last));
	check("wake: host-service ready", /host\.ready/.test(last));
	return failed;
}

/**
 * The first bytes the VNC server sends, read the way a pane reads them: the
 * display is not published, so it is host-service's route, with the secret the
 * gate presents on a person's behalf.
 */
function rfbHandshake(hostOrigin: string, hostSecret: string): Promise<string> {
	const url = new URL("/desktop/websockify", hostOrigin);
	url.protocol = "wss:";
	url.searchParams.set("token", hostSecret);
	return new Promise<string>((resolve) => {
		const ws = new WebSocket(url.toString());
		ws.binaryType = "arraybuffer";
		const timer = setTimeout(() => {
			resolve("timeout");
			ws.close();
		}, 30_000);
		ws.onmessage = (event) => {
			clearTimeout(timer);
			resolve(
				new TextDecoder().decode(
					new Uint8Array(event.data as ArrayBuffer).slice(0, 12),
				),
			);
			ws.close();
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve("error");
			ws.close();
		};
	});
}
