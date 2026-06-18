import { db, type dbWs } from "@superset/db/client";
import {
	automationCapabilities,
	capabilityPackages,
	capabilityPackageVersions,
	projectCapabilities,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { canActivateCapabilityVersion } from "./audit";
import type { CapabilityBindingInput } from "./schema";

export type CapabilityDbExecutor =
	| typeof dbWs
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

function badRequest(message: string): never {
	throw new TRPCError({ code: "BAD_REQUEST", message });
}

export async function resolveBindableCapabilityVersions(args: {
	organizationId: string;
	versionIds: string[];
}) {
	if (args.versionIds.length === 0) return new Map<string, string>();
	const uniqueIds = [...new Set(args.versionIds)];
	if (uniqueIds.length !== args.versionIds.length) {
		badRequest("Capability version bindings must be unique.");
	}

	const rows = await db
		.select({
			versionId: capabilityPackageVersions.id,
			capabilityId: capabilityPackageVersions.capabilityId,
			auditStatus: capabilityPackageVersions.auditStatus,
			packageStatus: capabilityPackages.status,
		})
		.from(capabilityPackageVersions)
		.innerJoin(
			capabilityPackages,
			eq(capabilityPackages.id, capabilityPackageVersions.capabilityId),
		)
		.where(
			and(
				inArray(capabilityPackageVersions.id, uniqueIds),
				eq(capabilityPackages.organizationId, args.organizationId),
			),
		);

	if (rows.length !== uniqueIds.length) {
		badRequest("One or more capability versions are unavailable.");
	}

	const byVersionId = new Map<string, string>();
	for (const row of rows) {
		if (row.packageStatus !== "active") {
			badRequest("Disabled capability packages cannot be bound.");
		}
		if (!canActivateCapabilityVersion({ auditStatus: row.auditStatus })) {
			badRequest("Only packages with passed security audits can be bound.");
		}
		byVersionId.set(row.versionId, row.capabilityId);
	}
	return byVersionId;
}

export async function setAutomationCapabilityBindingsInTx(args: {
	tx: CapabilityDbExecutor;
	automationId: string;
	capabilities: CapabilityBindingInput[];
	capabilityIdsByVersion: Map<string, string>;
}) {
	await args.tx
		.delete(automationCapabilities)
		.where(eq(automationCapabilities.automationId, args.automationId));
	if (args.capabilities.length === 0) return;

	await args.tx.insert(automationCapabilities).values(
		args.capabilities.map((item, index) => ({
			automationId: args.automationId,
			capabilityId: args.capabilityIdsByVersion.get(
				item.capabilityVersionId,
			) as string,
			capabilityVersionId: item.capabilityVersionId,
			enabled: item.enabled,
			config: item.config,
			displayOrder: item.displayOrder ?? index,
		})),
	);
}

export async function setProjectCapabilityBindingsInTx(args: {
	tx: CapabilityDbExecutor;
	projectId: string;
	capabilities: CapabilityBindingInput[];
	capabilityIdsByVersion: Map<string, string>;
}) {
	await args.tx
		.delete(projectCapabilities)
		.where(eq(projectCapabilities.projectId, args.projectId));
	if (args.capabilities.length === 0) return;

	await args.tx.insert(projectCapabilities).values(
		args.capabilities.map((item) => ({
			projectId: args.projectId,
			capabilityId: args.capabilityIdsByVersion.get(
				item.capabilityVersionId,
			) as string,
			capabilityVersionId: item.capabilityVersionId,
			enabled: item.enabled,
			config: item.config,
		})),
	);
}
