import { freestyleProvider } from "./freestyle";
import type { SandboxProvider } from "./types";
import * as vercel from "./vercel";

const vercelProvider: SandboxProvider = {
	...vercel,
	sleepSandbox: vercel.stopAndSnapshot,
	deleteEnvironment: vercel.deleteSandbox,
	async restartSandbox(args) {
		if ((await vercel.describeSandbox(args.providerSandboxId)).running) {
			await vercel.stopAndSnapshot(args.providerSandboxId);
		}
		return vercel.wakeSandbox(args);
	},
};

export function isSandboxProvider(provider: string): boolean {
	return provider === "vercel" || provider === "freestyle";
}

export function sandboxProvider(provider = "vercel"): SandboxProvider {
	if (provider === "vercel") return vercelProvider;
	if (provider === "freestyle") return freestyleProvider();
	throw new Error(`Unsupported sandbox provider: ${provider}`);
}

export const provisionSandbox = (
	args: Parameters<SandboxProvider["provisionSandbox"]>[0],
) =>
	sandboxProvider(
		args.claim.identity.SUPERSET_SANDBOX_PROVIDER,
	).provisionSandbox(args);
export const wakeSandbox = (
	args: Parameters<SandboxProvider["wakeSandbox"]>[0],
) =>
	sandboxProvider(args.claim.identity.SUPERSET_SANDBOX_PROVIDER).wakeSandbox(
		args,
	);
export const restartSandbox = (
	args: Parameters<SandboxProvider["restartSandbox"]>[0],
) =>
	sandboxProvider(args.claim.identity.SUPERSET_SANDBOX_PROVIDER).restartSandbox(
		args,
	);
export const promoteSandboxToEnvironment = (
	args: Parameters<SandboxProvider["promoteSandboxToEnvironment"]>[0],
) =>
	sandboxProvider(
		args.claim.identity.SUPERSET_SANDBOX_PROVIDER,
	).promoteSandboxToEnvironment(args);
export const applySandboxPolicy = (
	args: Parameters<SandboxProvider["applySandboxPolicy"]>[0] & {
		provider?: string;
	},
) => sandboxProvider(args.provider).applySandboxPolicy(args);
export const describeSandbox = (id: string, provider?: string) =>
	sandboxProvider(provider).describeSandbox(id);
export const stopSandbox = (id: string, provider?: string) =>
	sandboxProvider(provider).stopSandbox(id);
export const stopAndSnapshot = (id: string, provider?: string) =>
	sandboxProvider(provider).stopAndSnapshot(id);
export const sleepSandbox = (id: string, provider?: string) =>
	sandboxProvider(provider).sleepSandbox(id);
export const deleteSandbox = (id: string, provider?: string) =>
	sandboxProvider(provider).deleteSandbox(id);
export const deleteEnvironment = (ref: string, provider?: string) =>
	sandboxProvider(provider).deleteEnvironment(ref);
export const sandboxExists = (id: string, provider?: string) =>
	sandboxProvider(provider).sandboxExists(id);
