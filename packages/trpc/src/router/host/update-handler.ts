import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	isInstallableHostVersion,
	MAX_INSTALLABLE_HOST_VERSION_LENGTH,
} from "@superset/shared/host-version";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { RelayDispatchError } from "../automation/relay-client";

export const hostUpdateInputSchema = z.object({
	organizationId: z.string().uuid(),
	machineId: z.string().min(1),
	targetVersion: z
		.string()
		.max(MAX_INSTALLABLE_HOST_VERSION_LENGTH)
		.refine(isInstallableHostVersion, {
			message: "Invalid Superset version",
		}),
});

export type HostUpdateInput = z.infer<typeof hostUpdateInputSchema>;

export interface HostUpdateResult {
	outcome: "dispatched" | "satisfied";
	previousVersion: string;
	newVersion: string | null;
	supervisorPid: number | null;
}

export interface HostUpdateContext {
	userId: string;
	email: string;
	organizationIds: string[];
}

interface HostAccessInput {
	organizationId: string;
	userId: string;
	machineId: string;
}

interface MintJwtInput {
	userId: string;
	email?: string;
	organizationIds: string[];
	scope: string;
	runId: string;
	ttlSeconds: number;
}

interface RelayHostUpdateInput {
	relayUrl: string;
	hostId: string;
	jwt: string;
	targetVersion: string;
}

export interface HostUpdateDependencies {
	relayUrl: string;
	findHostRole: (input: HostAccessInput) => Promise<"owner" | "member" | null>;
	mintJwt: (input: MintJwtInput) => Promise<string>;
	dispatch: (input: RelayHostUpdateInput) => Promise<HostUpdateResult>;
}

export async function executeHostUpdate(
	ctx: HostUpdateContext,
	input: HostUpdateInput,
	dependencies: HostUpdateDependencies,
): Promise<HostUpdateResult> {
	if (!ctx.organizationIds.includes(input.organizationId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}

	const role = await dependencies.findHostRole({
		organizationId: input.organizationId,
		userId: ctx.userId,
		machineId: input.machineId,
	});
	if (role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the host owner can update it",
		});
	}

	const hostId = buildHostRoutingKey(input.organizationId, input.machineId);
	const jwt = await dependencies.mintJwt({
		userId: ctx.userId,
		email: ctx.email || undefined,
		organizationIds: [input.organizationId],
		scope: "host-update",
		runId: `host-update:${hostId}`,
		ttlSeconds: 300,
	});

	try {
		return await dependencies.dispatch({
			relayUrl: dependencies.relayUrl,
			hostId,
			jwt,
			targetVersion: input.targetVersion,
		});
	} catch (error) {
		if (error instanceof RelayDispatchError) {
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: `Failed to dispatch host update: ${error.message}`,
				cause: error,
			});
		}
		throw error;
	}
}
