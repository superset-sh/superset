import { db, dbWs } from "@superset/db/client";
import {
	automationCapabilities,
	automations,
	capabilityPackages,
	capabilityPackageVersions,
	projectCapabilities,
	v2Projects,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	capabilityArtifactPathname,
	storeCapabilityArtifact,
} from "./artifact-storage";
import {
	auditValidatedCapabilityPackage,
	canActivateCapabilityVersion,
} from "./audit";
import { resolveCapabilityAuditModel } from "./audit-model";
import {
	resolveBindableCapabilityVersions,
	setAutomationCapabilityBindingsInTx,
	setProjectCapabilityBindingsInTx,
} from "./bindings";
import {
	bufferFromBase64Data,
	validateCapabilityZipPackage,
} from "./package-validation";
import {
	automationCapabilityBindingsSchema,
	capabilityPackageUploadSchema,
	projectCapabilityBindingsSchema,
} from "./schema";

function notFound(message = "Capability package not found"): never {
	throw new TRPCError({ code: "NOT_FOUND", message });
}

function badRequest(message: string): never {
	throw new TRPCError({ code: "BAD_REQUEST", message });
}

function conflict(message: string): never {
	throw new TRPCError({ code: "CONFLICT", message });
}

async function getCapabilityUsageCounts(capabilityId: string) {
	const [projectUsage] = await db
		.select({ value: count() })
		.from(projectCapabilities)
		.where(eq(projectCapabilities.capabilityId, capabilityId));
	const [automationUsage] = await db
		.select({ value: count() })
		.from(automationCapabilities)
		.where(eq(automationCapabilities.capabilityId, capabilityId));

	return {
		projects: projectUsage?.value ?? 0,
		automations: automationUsage?.value ?? 0,
	};
}

async function requireOwnedAutomation(args: {
	organizationId: string;
	userId: string;
	automationId: string;
}) {
	const [automation] = await db
		.select({ id: automations.id })
		.from(automations)
		.where(
			and(
				eq(automations.id, args.automationId),
				eq(automations.organizationId, args.organizationId),
				eq(automations.ownerUserId, args.userId),
			),
		)
		.limit(1);
	if (!automation) notFound("Automation not found");
}

async function requireProject(args: {
	organizationId: string;
	projectId: string;
}) {
	const [project] = await db
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.id, args.projectId),
				eq(v2Projects.organizationId, args.organizationId),
			),
		)
		.limit(1);
	if (!project) notFound("Project not found");
}

async function listProjectCapabilityBindings(projectId: string) {
	return db
		.select({
			projectId: projectCapabilities.projectId,
			capabilityId: projectCapabilities.capabilityId,
			capabilityVersionId: projectCapabilities.capabilityVersionId,
			enabled: projectCapabilities.enabled,
			config: projectCapabilities.config,
			type: capabilityPackages.type,
			slug: capabilityPackages.slug,
			name: capabilityPackages.name,
			version: capabilityPackageVersions.version,
			auditStatus: capabilityPackageVersions.auditStatus,
		})
		.from(projectCapabilities)
		.innerJoin(
			capabilityPackages,
			eq(capabilityPackages.id, projectCapabilities.capabilityId),
		)
		.innerJoin(
			capabilityPackageVersions,
			eq(capabilityPackageVersions.id, projectCapabilities.capabilityVersionId),
		)
		.where(eq(projectCapabilities.projectId, projectId));
}

export async function listAutomationCapabilityBindings(automationId: string) {
	return db
		.select({
			automationId: automationCapabilities.automationId,
			capabilityId: automationCapabilities.capabilityId,
			capabilityVersionId: automationCapabilities.capabilityVersionId,
			enabled: automationCapabilities.enabled,
			config: automationCapabilities.config,
			displayOrder: automationCapabilities.displayOrder,
			type: capabilityPackages.type,
			slug: capabilityPackages.slug,
			name: capabilityPackages.name,
			packageStatus: capabilityPackages.status,
			version: capabilityPackageVersions.version,
			manifest: capabilityPackageVersions.manifest,
			artifactUrl: capabilityPackageVersions.artifactUrl,
			artifactSha256: capabilityPackageVersions.artifactSha256,
			auditStatus: capabilityPackageVersions.auditStatus,
		})
		.from(automationCapabilities)
		.innerJoin(
			capabilityPackages,
			eq(capabilityPackages.id, automationCapabilities.capabilityId),
		)
		.innerJoin(
			capabilityPackageVersions,
			eq(
				capabilityPackageVersions.id,
				automationCapabilities.capabilityVersionId,
			),
		)
		.where(eq(automationCapabilities.automationId, automationId))
		.orderBy(automationCapabilities.displayOrder);
}

export const capabilityRouter = {
	list: protectedProcedure
		.input(
			z
				.object({
					type: z.enum(["skill", "cli"]).optional(),
					query: z.string().trim().min(1).max(120).optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rows = await db
				.select({
					id: capabilityPackages.id,
					type: capabilityPackages.type,
					slug: capabilityPackages.slug,
					name: capabilityPackages.name,
					description: capabilityPackages.description,
					status: capabilityPackages.status,
					currentVersionId: capabilityPackages.currentVersionId,
					currentVersion: capabilityPackageVersions.version,
					auditStatus: capabilityPackageVersions.auditStatus,
					auditSummary: capabilityPackageVersions.auditSummary,
					artifactSha256: capabilityPackageVersions.artifactSha256,
					createdAt: capabilityPackages.createdAt,
					updatedAt: capabilityPackages.updatedAt,
				})
				.from(capabilityPackages)
				.leftJoin(
					capabilityPackageVersions,
					eq(capabilityPackageVersions.id, capabilityPackages.currentVersionId),
				)
				.where(
					and(
						eq(capabilityPackages.organizationId, organizationId),
						input?.type ? eq(capabilityPackages.type, input.type) : undefined,
					),
				)
				.orderBy(desc(capabilityPackages.updatedAt));

			const normalizedQuery = input?.query?.toLowerCase();
			if (!normalizedQuery) return rows;
			return rows.filter((row) =>
				[row.name, row.slug, row.description ?? ""]
					.join(" ")
					.toLowerCase()
					.includes(normalizedQuery),
			);
		}),

	get: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [capability] = await db
				.select()
				.from(capabilityPackages)
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!capability) notFound();

			const versions = await db
				.select()
				.from(capabilityPackageVersions)
				.where(eq(capabilityPackageVersions.capabilityId, input.id))
				.orderBy(desc(capabilityPackageVersions.createdAt));

			return {
				...capability,
				versions,
				usage: await getCapabilityUsageCounts(input.id),
			};
		}),

	validatePackage: protectedProcedure
		.input(capabilityPackageUploadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const pkg = validateCapabilityZipPackage(input.fileData);
			const auditModel = await resolveCapabilityAuditModel(organizationId);
			const audit = await auditValidatedCapabilityPackage({
				pkg,
				model: auditModel,
			});
			return {
				manifest: pkg.manifest,
				archiveSha256: pkg.archiveSha256,
				manifestSha256: pkg.manifestSha256,
				validationSummary: pkg.validationSummary,
				audit,
			};
		}),

	importPackage: protectedProcedure
		.input(capabilityPackageUploadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const pkg = validateCapabilityZipPackage(input.fileData);
			const auditModel = await resolveCapabilityAuditModel(organizationId);
			const audit = await auditValidatedCapabilityPackage({
				pkg,
				model: auditModel,
			});
			const archiveBuffer = bufferFromBase64Data(input.fileData);
			const displaySummary =
				pkg.validationSummary.display.summary ??
				pkg.manifest.description ??
				null;
			const pathname = capabilityArtifactPathname({
				organizationId,
				slug: pkg.manifest.id,
				version: pkg.manifest.version,
				sha256: pkg.archiveSha256,
			});
			const artifact = await storeCapabilityArtifact({
				pathname,
				archiveBuffer,
			});

			try {
				const result = await dbWs.transaction(async (tx) => {
					const [existing] = await tx
						.select()
						.from(capabilityPackages)
						.where(
							and(
								eq(capabilityPackages.organizationId, organizationId),
								eq(capabilityPackages.slug, pkg.manifest.id),
							),
						)
						.limit(1);

					if (existing && existing.type !== pkg.manifest.type) {
						badRequest(
							`Package '${pkg.manifest.id}' already exists as ${existing.type}.`,
						);
					}

					const capability =
						existing ??
						(
							await tx
								.insert(capabilityPackages)
								.values({
									organizationId,
									ownerUserId: ctx.session.user.id,
									type: pkg.manifest.type,
									slug: pkg.manifest.id,
									name: pkg.manifest.name,
									description: displaySummary,
									status: audit.status === "passed" ? "active" : "disabled",
								})
								.returning()
						)[0];

					if (!capability) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create capability package.",
						});
					}

					const [duplicateVersion] = await tx
						.select({ id: capabilityPackageVersions.id })
						.from(capabilityPackageVersions)
						.where(
							and(
								eq(capabilityPackageVersions.capabilityId, capability.id),
								eq(capabilityPackageVersions.version, pkg.manifest.version),
							),
						)
						.limit(1);
					if (duplicateVersion) {
						conflict(
							`Version ${pkg.manifest.version} already exists for ${pkg.manifest.id}.`,
						);
					}

					const [version] = await tx
						.insert(capabilityPackageVersions)
						.values({
							capabilityId: capability.id,
							version: pkg.manifest.version,
							manifest: pkg.manifest,
							artifactUrl: artifact.url,
							artifactPathname: artifact.pathname,
							artifactSha256: pkg.archiveSha256,
							artifactSizeBytes: pkg.archiveSizeBytes,
							sourceType: input.sourceType,
							sourceRef: input.sourceRef ?? input.filename,
							validationSummary: pkg.validationSummary,
							auditStatus: audit.status,
							auditModelProviderId: audit.modelProviderId,
							auditModelId: audit.modelId,
							auditSummary: audit.summary,
							auditFindings: audit.findings,
							createdByUserId: ctx.session.user.id,
						})
						.returning();

					if (!version) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to create capability package version.",
						});
					}

					if (
						canActivateCapabilityVersion({ auditStatus: version.auditStatus })
					) {
						await tx
							.update(capabilityPackages)
							.set({
								name: pkg.manifest.name,
								description: displaySummary,
								currentVersionId: version.id,
								status: "active",
								updatedAt: new Date(),
							})
							.where(eq(capabilityPackages.id, capability.id));
					}

					return { capability, version };
				});

				return {
					...result,
					manifest: pkg.manifest,
					validationSummary: pkg.validationSummary,
					audit,
				};
			} catch (error) {
				await artifact.cleanup().catch((cleanupError) => {
					console.warn("[capability] failed to clean up orphaned artifact", {
						pathname: artifact.pathname,
						cleanupError,
					});
				});
				throw error;
			}
		}),

	setStatus: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				status: z.enum(["active", "disabled"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [updated] = await dbWs
				.update(capabilityPackages)
				.set({ status: input.status, updatedAt: new Date() })
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, organizationId),
					),
				)
				.returning();
			if (!updated) notFound();
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [capability] = await db
				.select()
				.from(capabilityPackages)
				.where(
					and(
						eq(capabilityPackages.id, input.id),
						eq(capabilityPackages.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!capability) notFound();

			const usage = await getCapabilityUsageCounts(input.id);
			if (usage.projects > 0 || usage.automations > 0) {
				badRequest(
					"Capability package is still used by projects or automations.",
				);
			}

			await dbWs
				.delete(capabilityPackages)
				.where(eq(capabilityPackages.id, input.id));
			return { ok: true };
		}),

	listProjectBindings: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await requireProject({ organizationId, projectId: input.projectId });
			return listProjectCapabilityBindings(input.projectId);
		}),

	setProjectBindings: protectedProcedure
		.input(projectCapabilityBindingsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await requireProject({ organizationId, projectId: input.projectId });
			const capabilityIdsByVersion = await resolveBindableCapabilityVersions({
				organizationId,
				versionIds: input.capabilities.map((item) => item.capabilityVersionId),
			});

			await dbWs.transaction(async (tx) => {
				await setProjectCapabilityBindingsInTx({
					tx,
					projectId: input.projectId,
					capabilities: input.capabilities,
					capabilityIdsByVersion,
				});
			});

			return listProjectCapabilityBindings(input.projectId);
		}),

	listAutomationBindings: protectedProcedure
		.input(z.object({ automationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await requireOwnedAutomation({
				organizationId,
				userId: ctx.session.user.id,
				automationId: input.automationId,
			});
			return listAutomationCapabilityBindings(input.automationId);
		}),

	setAutomationBindings: protectedProcedure
		.input(automationCapabilityBindingsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await requireOwnedAutomation({
				organizationId,
				userId: ctx.session.user.id,
				automationId: input.automationId,
			});
			const capabilityIdsByVersion = await resolveBindableCapabilityVersions({
				organizationId,
				versionIds: input.capabilities.map((item) => item.capabilityVersionId),
			});

			await dbWs.transaction(async (tx) => {
				await setAutomationCapabilityBindingsInTx({
					tx,
					automationId: input.automationId,
					capabilities: input.capabilities,
					capabilityIdsByVersion,
				});
			});

			return listAutomationCapabilityBindings(input.automationId);
		}),
} satisfies TRPCRouterRecord;
