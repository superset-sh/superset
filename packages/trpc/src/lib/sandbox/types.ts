import type { SandboxIdentity } from "@superset/shared/sandbox-contract";

export interface SandboxNetworkRule {
	match?: {
		headers: Array<{ key: { exact: string }; value: { exact: string } }>;
	};
	transform: Array<{ headers: Record<string, string> }>;
}

export type SandboxNetworkPolicy =
	| "allow-all"
	| { allow: Record<string, SandboxNetworkRule[]> };

export interface SandboxEnvironment {
	sourceKind: "image" | "fork";
	sourceRef: string;
	region: string;
}

/** Everything the box needs to become one workspace; nothing of it is a create-time env. */
export interface SandboxClaim {
	identity: SandboxIdentity;
	/** What the gate presents; travels only in the boot command's env. */
	hostSecret: string;
	managedEnv: Record<string, string>;
	networkPolicy: SandboxNetworkPolicy;
	/** Ports the workspace's repository asks to publish, beside the platform's. */
	ports?: readonly number[];
}

export class SandboxUnavailableError extends Error {
	constructor(
		readonly providerSandboxId: string,
		cause: unknown,
	) {
		super(`Sandbox ${providerSandboxId} is unavailable`, { cause });
	}
}

export class SandboxNotReadyError extends Error {
	constructor(providerSandboxId: string) {
		super(`host-service in ${providerSandboxId} did not answer in time`);
		this.name = "SandboxNotReadyError";
	}
}

export interface SandboxAddress {
	hostTarget: string;
	running: boolean;
}
export interface SandboxWake {
	hostTarget: string;
	booted: boolean;
}
export interface SandboxProvider {
	provisionSandbox(args: {
		name: string;
		environment: SandboxEnvironment;
		claim: SandboxClaim;
		kind?: "workspace" | "environment";
	}): Promise<{
		providerSandboxId: string;
		sandboxUrl: string;
		hostTarget: string;
	}>;
	describeSandbox(id: string): Promise<SandboxAddress>;
	wakeSandbox(args: {
		providerSandboxId: string;
		claim: SandboxClaim;
	}): Promise<SandboxWake>;
	restartSandbox(args: {
		providerSandboxId: string;
		claim: SandboxClaim;
	}): Promise<SandboxWake>;
	sleepSandbox(id: string): Promise<void>;
	stopSandbox(id: string): Promise<void>;
	stopAndSnapshot(id: string): Promise<void>;
	sandboxExists(id: string): Promise<boolean>;
	deleteSandbox(id: string): Promise<void>;
	deleteEnvironment(ref: string): Promise<void>;
	applySandboxPolicy(args: {
		providerSandboxId: string;
		networkPolicy: SandboxNetworkPolicy;
	}): Promise<"applied" | "not-running">;
	promoteSandboxToEnvironment(args: {
		sourceSandbox: string;
		goldenName: string;
		claim: SandboxClaim;
	}): Promise<{ goldenName: string; region: string }>;
}
