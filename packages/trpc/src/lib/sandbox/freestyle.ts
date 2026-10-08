import { createHash } from "node:crypto";
import {
	renderSandboxConf,
	SANDBOX_PATHS,
} from "@superset/shared/sandbox-contract";
import {
	Freestyle,
	FreestyleApiError,
	type TlsRuleData,
	type Vm,
} from "freestyle";
import { env } from "../../env";
import { coldStop, rootExec } from "./freestyle-vm";
import { HOST_SERVICE_PORT, settleSandbox } from "./runtime";
import {
	type SandboxClaim,
	type SandboxNetworkPolicy,
	type SandboxProvider,
	SandboxUnavailableError,
} from "./types";

const SESSION_SECONDS = 4 * 60 * 60;
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

function notFound(error: unknown): boolean {
	return error instanceof FreestyleApiError && error.status === 404;
}

function address(id: string, workspaceId: string): string {
	return `https://ss-${workspaceId.replaceAll("-", "")}-${createHash("sha256").update(id).digest("hex").slice(0, 12)}.style.dev`;
}
function vmAddress(current: {
	id: string;
	metadata: Record<string, string>;
}): string {
	const workspace = current.metadata.workspace;
	if (!workspace || !/^[0-9a-f-]{36}$/.test(workspace))
		throw new Error("Freestyle VM has no Superset workspace identity");
	return address(current.id, workspace);
}

export function credentialRules(policy: SandboxNetworkPolicy) {
	if (policy === "allow-all") return [];
	if (!policy.allow["*"] || policy.allow["*"].length !== 0) {
		throw new Error("Freestyle requires Superset's Internet catch-all policy");
	}
	return Object.entries(policy.allow).flatMap(([domain, rules]) => {
		if (domain === "*") return [];
		if (rules.length !== 1) {
			throw new Error(`Freestyle requires one credential rule for ${domain}`);
		}
		const rule = rules[0];
		if (!rule) throw new Error(`Missing credential rule for ${domain}`);
		return [{ domain, match: rule.match, transform: rule.transform }];
	});
}

export function createFreestyleProvider(client: Freestyle): SandboxProvider {
	async function data(id: string) {
		try {
			return await client.vms.get(id);
		} catch (error) {
			if (notFound(error)) throw new SandboxUnavailableError(id, error);
			throw error;
		}
	}

	async function rules(id: string): Promise<TlsRuleData[]> {
		const all: TlsRuleData[] = [];
		for (;;) {
			const page = await client.tls.rules.list({
				vmId: id,
				offset: all.length,
				limit: 100,
			});
			all.push(...page.rules);
			if (all.length >= page.totalCount || page.rules.length === 0) return all;
		}
	}

	async function applyPolicy(id: string, policy: SandboxNetworkPolicy) {
		const desired = credentialRules(policy);
		const existing = (await rules(id)).filter(
			(rule) =>
				rule.source.vmId === id &&
				rule.destination.public &&
				rule.protocol === "http",
		);
		for (const entry of desired) {
			const current = existing.find((rule) => rule.domain === entry.domain);
			// SDK 0.2.16's validator predates header matches; keep the wire contract
			// intact rather than dropping a condition it does not understand.
			const response = await client.fetch(
				current ? `/v5/tls/${current.id}` : "/v5/tls",
				{
					method: current ? "PUT" : "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "allow",
						source: { vmId: id },
						destination: { public: true },
						...entry,
					}),
					signal: AbortSignal.timeout(30_000),
				},
			);
			if (!response.ok)
				throw new Error(
					`Freestyle credential policy rejected (${response.status}); header-match support must be deployed`,
				);
		}
		for (const rule of existing) {
			if (!desired.some((entry) => entry.domain === rule.domain))
				await client.tls.rules.delete(rule.id);
		}
	}

	async function publish(vm: Vm) {
		if (!env.FREESTYLE_SANDBOX_FORWARD_AUTH_ID)
			throw new Error("FREESTYLE_SANDBOX_FORWARD_AUTH_ID is not configured");
		const current = await vm.data();
		const domain = new URL(vmAddress(current)).hostname;
		if (
			!(await rules(current.id)).some(
				(rule) =>
					rule.domain === domain && rule.destination.vmId === current.id,
			)
		) {
			await client.tls.rules.create({
				action: "allow",
				domain,
				source: { public: true },
				destination: { vmId: current.id, port: HOST_SERVICE_PORT },
				forwardAuth: { id: env.FREESTYLE_SANDBOX_FORWARD_AUTH_ID },
			});
		}
	}

	async function boot(vm: Vm, claim: SandboxClaim) {
		await rootExec(vm, `install -d /etc/superset ${SANDBOX_PATHS.logs}`);
		await vm.fs.writeTextFile(
			SANDBOX_PATHS.conf,
			renderSandboxConf(claim.identity),
		);
		const result = await vm.linuxUser("root").exec({
			command:
				"nohup /usr/local/bin/superset-boot >/var/log/superset/launch.log 2>&1 </dev/null &",
			env: { HOST_SERVICE_SECRET: claim.hostSecret },
		});
		if (result.statusCode !== 0)
			throw new Error(`Freestyle boot failed (${result.statusCode})`);
	}

	async function wake(args: {
		providerSandboxId: string;
		claim: SandboxClaim;
	}) {
		const current = await data(args.providerSandboxId);
		const vm = client.vms.ref(current.id);
		await applyPolicy(current.id, args.claim.networkPolicy);
		await vm.update({
			maxRunTotalSeconds:
				Math.ceil(current.totalRunSeconds ?? 0) + SESSION_SECONDS,
		});
		if (current.state !== "running") await vm.start();
		await publish(vm);
		const target = vmAddress(current);
		const serving = await fetch(`${target}/trpc/health.check`, {
			headers: { authorization: `Bearer ${args.claim.hostSecret}` },
			signal: AbortSignal.timeout(1500),
		})
			.then((response) => response.ok)
			.catch(() => false);
		if (!serving) await boot(vm, args.claim);
		else
			await vm.fs.writeTextFile(
				SANDBOX_PATHS.conf,
				renderSandboxConf(args.claim.identity),
			);
		await settleSandbox({ ...args, hostTarget: target });
		return {
			hostTarget: target,
			booted: current.state === "stopped" || !serving,
		};
	}

	async function pause(id: string) {
		const current = await data(id);
		if (current.state === "running") await client.vms.ref(current.id).pause();
	}

	return {
		async provisionSandbox(args) {
			credentialRules(args.claim.networkPolicy);
			let current = await client.vms.get(args.name).catch((error: unknown) => {
				if (notFound(error)) return null;
				throw error;
			});
			if (!current) {
				try {
					current = (
						await client.vms.create({
							slug: args.name,
							snapshotId: args.environment.sourceRef,
							firewall: { rules: [] },
							autoDeleteSeconds:
								args.kind === "environment" ? -1 : RETENTION_SECONDS,
							maxRunTotalSeconds: SESSION_SECONDS,
							automaticRestart: false,
							metadata: {
								kind: args.kind ?? "workspace",
								workspace: args.claim.identity.SUPERSET_SANDBOX_WORKSPACE_ID,
							},
						})
					).data;
				} catch (error) {
					if (!(error instanceof FreestyleApiError && error.status === 409))
						throw error;
					current = await client.vms.get(args.name);
				}
			}
			await applyPolicy(current.id, args.claim.networkPolicy);
			const firewall = await client.firewall.rules.list({ vmId: current.id });
			if (
				!firewall.rules.some(
					(rule) => rule.source.vmId === current.id && rule.destination.public,
				)
			) {
				await client.firewall.rules.create({
					action: "allow",
					source: { vmId: current.id },
					destination: { public: true },
				});
			}
			const vm = client.vms.ref(current.id);
			await publish(vm);
			await boot(vm, args.claim);
			return {
				providerSandboxId: args.name,
				sandboxUrl: vmAddress(current),
				hostTarget: vmAddress(current),
			};
		},
		async describeSandbox(id) {
			const current = await data(id);
			return {
				hostTarget: vmAddress(current),
				running: current.state === "running",
			};
		},
		wakeSandbox: wake,
		async restartSandbox(args) {
			const current = await data(args.providerSandboxId);
			await client.vms.ref(current.id).update({
				maxRunTotalSeconds:
					Math.ceil(current.totalRunSeconds ?? 0) + SESSION_SECONDS,
			});
			await coldStop(client.vms.ref((await data(args.providerSandboxId)).id));
			return wake(args);
		},
		sleepSandbox: pause,
		stopSandbox: pause,
		stopAndSnapshot: pause,
		async sandboxExists(id) {
			try {
				await client.vms.get(id);
				return true;
			} catch (error) {
				if (notFound(error)) return false;
				throw error;
			}
		},
		async deleteSandbox(id) {
			const current = await client.vms.get(id).catch((error: unknown) => {
				if (notFound(error)) return null;
				throw error;
			});
			if (!current) return;
			await client.vms.delete(current.id);
		},
		async deleteEnvironment(ref) {
			await client.vms.snapshots.delete(ref).catch((error: unknown) => {
				if (!notFound(error)) throw error;
			});
		},
		async applySandboxPolicy(args) {
			const current = await data(args.providerSandboxId);
			if (current.state !== "running") return "not-running";
			await applyPolicy(current.id, args.networkPolicy);
			return "applied";
		},
		async promoteSandboxToEnvironment(args) {
			const existing = await client.vms.snapshots
				.get(args.goldenName)
				.catch((error: unknown) => {
					if (notFound(error)) return null;
					throw error;
				});
			if (existing) return { goldenName: existing.id, region: "default" };
			const source = client.vms.ref((await data(args.sourceSandbox)).id);
			const current = await source.data();
			if (current.state === "stopped") {
				await source.update({
					maxRunTotalSeconds:
						Math.ceil(current.totalRunSeconds ?? 0) + SESSION_SECONDS,
				});
				await source.start();
			}
			const staging = await source.snapshot({ ttlSeconds: 3600 });
			let clone: Vm | undefined;
			try {
				clone = (
					await client.vms.create({
						snapshotId: staging.snapshotId,
						firewall: { rules: [] },
						autoDeleteSeconds: 3600,
						ttlSeconds: 3600,
						automaticRestart: false,
					})
				).vm;
				await coldStop(clone);
				await clone.start();
				await rootExec(
					clone,
					`rm -rf ${[SANDBOX_PATHS.conf, SANDBOX_PATHS.logs, SANDBOX_PATHS.hostDb, `${SANDBOX_PATHS.hostDb}-wal`, `${SANDBOX_PATHS.hostDb}-shm`, SANDBOX_PATHS.checkouts, `${SANDBOX_PATHS.state}/agent-launched`, `${SANDBOX_PATHS.state}/db-branch`, `${SANDBOX_PATHS.home}/.superset/host`, `${SANDBOX_PATHS.home}/.gitconfig`, `${SANDBOX_PATHS.workspace}/.env`].join(" ")}`,
				);
				await coldStop(clone);
				await clone.start();
				const snapshot = await clone.snapshot({
					slug: args.goldenName,
					autoDeleteSeconds: -1,
				});
				return { goldenName: snapshot.snapshotId, region: "default" };
			} finally {
				try {
					if (clone) await clone.delete();
				} finally {
					await client.vms.snapshots.delete(staging.snapshotId);
				}
			}
		},
	};
}

export function freestyleProvider(): SandboxProvider {
	if (!env.FREESTYLE_API_KEY)
		throw new Error("FREESTYLE_API_KEY is not configured");
	return createFreestyleProvider(
		new Freestyle({ apiKey: env.FREESTYLE_API_KEY }),
	);
}
