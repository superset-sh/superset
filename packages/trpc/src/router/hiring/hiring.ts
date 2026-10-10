import { db, dbWs } from "@superset/db/client";
import {
	type HiringEventMetadata,
	hiringApplications,
	hiringCandidates,
	hiringEvents,
	hiringRoles,
	users,
} from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	lte,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { adminProcedure } from "../../trpc";
import {
	addEventSchema,
	createCandidateSchema,
	findDuplicatesSchema,
	listApplicationsSchema,
	logTouchSchema,
	updateApplicationSchema,
	updateCandidateSchema,
} from "./schema";

const owners = alias(users, "owner");

const applicationRowColumns = {
	applicationId: hiringApplications.id,
	candidateId: hiringCandidates.id,
	name: hiringCandidates.name,
	email: hiringCandidates.email,
	currentTitle: hiringCandidates.currentTitle,
	currentCompany: hiringCandidates.currentCompany,
	githubUrl: hiringCandidates.githubUrl,
	source: hiringCandidates.source,
	roleId: hiringRoles.id,
	roleTitle: hiringRoles.title,
	stage: hiringApplications.stage,
	outcome: hiringApplications.outcome,
	score: hiringApplications.score,
	ownerUserId: hiringApplications.ownerUserId,
	ownerName: owners.name,
	nextStep: hiringApplications.nextStep,
	nextFollowUpOn: hiringApplications.nextFollowUpOn,
	lastContactedAt: hiringApplications.lastContactedAt,
	stageChangedAt: hiringApplications.stageChangedAt,
	createdAt: hiringApplications.createdAt,
};

function selectApplicationRows() {
	return db
		.select(applicationRowColumns)
		.from(hiringApplications)
		.innerJoin(
			hiringCandidates,
			eq(hiringCandidates.id, hiringApplications.candidateId),
		)
		.innerJoin(hiringRoles, eq(hiringRoles.id, hiringApplications.roleId))
		.leftJoin(owners, eq(owners.id, hiringApplications.ownerUserId));
}

function todayIsoDate() {
	return new Date().toISOString().slice(0, 10);
}

async function findDuplicateCandidates(input: {
	email?: string | null;
	githubUrl?: string | null;
}) {
	const matches: SQL[] = [];
	if (input.email) matches.push(eq(hiringCandidates.email, input.email));
	if (input.githubUrl) {
		matches.push(
			sql`lower(${hiringCandidates.githubUrl}) = lower(${input.githubUrl})`,
		);
	}
	if (matches.length === 0) return [];
	return db
		.select({
			id: hiringCandidates.id,
			name: hiringCandidates.name,
			email: hiringCandidates.email,
			githubUrl: hiringCandidates.githubUrl,
		})
		.from(hiringCandidates)
		.where(or(...matches))
		.limit(5);
}

export const hiringRouter = {
	roles: adminProcedure.query(() =>
		db.select().from(hiringRoles).orderBy(asc(hiringRoles.title)),
	),

	createRole: adminProcedure
		.input(z.object({ title: z.string().trim().min(1).max(200) }))
		.mutation(async ({ input }) => {
			const [role] = await db
				.insert(hiringRoles)
				.values({ title: input.title })
				.onConflictDoNothing()
				.returning();
			if (role) return role;
			const [existing] = await db
				.select()
				.from(hiringRoles)
				.where(eq(hiringRoles.title, input.title));
			return existing;
		}),

	/** People who can own a candidate: company accounts only. */
	owners: adminProcedure.query(() =>
		db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(ilike(users.email, `%${COMPANY.EMAIL_DOMAIN}`))
			.orderBy(asc(users.name)),
	),

	list: adminProcedure
		.input(listApplicationsSchema)
		.query(async ({ input }) => {
			const filters: SQL[] = [];
			if (input.status === "active") {
				filters.push(eq(hiringApplications.outcome, "active"));
			} else if (input.status === "closed") {
				filters.push(ne(hiringApplications.outcome, "active"));
			}
			if (input.roleId)
				filters.push(eq(hiringApplications.roleId, input.roleId));
			if (input.ownerUserId) {
				filters.push(eq(hiringApplications.ownerUserId, input.ownerUserId));
			}
			if (input.source) filters.push(eq(hiringCandidates.source, input.source));
			if (input.q) {
				const pattern = `%${input.q.replace(/[%_\\]/g, "\\$&")}%`;
				const search = or(
					ilike(hiringCandidates.name, pattern),
					ilike(hiringCandidates.email, pattern),
					ilike(hiringCandidates.currentCompany, pattern),
					ilike(hiringCandidates.githubUrl, pattern),
				);
				if (search) filters.push(search);
			}
			return selectApplicationRows()
				.where(and(...filters))
				.orderBy(desc(hiringApplications.updatedAt))
				.limit(1000);
		}),

	/** Active applications whose follow-up date is today or earlier. */
	today: adminProcedure.query(() =>
		selectApplicationRows()
			.where(
				and(
					eq(hiringApplications.outcome, "active"),
					isNotNull(hiringApplications.nextFollowUpOn),
					lte(hiringApplications.nextFollowUpOn, todayIsoDate()),
				),
			)
			.orderBy(asc(hiringApplications.nextFollowUpOn)),
	),

	get: adminProcedure
		.input(z.object({ candidateId: z.string().uuid() }))
		.query(async ({ input }) => {
			const [candidate] = await db
				.select()
				.from(hiringCandidates)
				.where(eq(hiringCandidates.id, input.candidateId));
			if (!candidate) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Candidate not found",
				});
			}

			const [applications, events, supersetUser] = await Promise.all([
				selectApplicationRows()
					.where(eq(hiringApplications.candidateId, candidate.id))
					.orderBy(asc(hiringApplications.createdAt)),
				db
					.select({
						id: hiringEvents.id,
						applicationId: hiringEvents.applicationId,
						kind: hiringEvents.kind,
						body: hiringEvents.body,
						metadata: hiringEvents.metadata,
						authorUserId: hiringEvents.authorUserId,
						authorName: users.name,
						authorLabel: hiringEvents.authorLabel,
						occurredAt: hiringEvents.occurredAt,
					})
					.from(hiringEvents)
					.leftJoin(users, eq(users.id, hiringEvents.authorUserId))
					.where(eq(hiringEvents.candidateId, candidate.id))
					.orderBy(desc(hiringEvents.occurredAt)),
				candidate.supersetUserId
					? db
							.select({
								id: users.id,
								name: users.name,
								email: users.email,
								createdAt: users.createdAt,
							})
							.from(users)
							.where(eq(users.id, candidate.supersetUserId))
							.then((rows) => rows[0] ?? null)
					: Promise.resolve(null),
			]);

			return { candidate, applications, events, supersetUser };
		}),

	findDuplicates: adminProcedure
		.input(findDuplicatesSchema)
		.query(({ input }) => findDuplicateCandidates(input)),

	createCandidate: adminProcedure
		.input(createCandidateSchema)
		.mutation(async ({ ctx, input }) => {
			const duplicates = await findDuplicateCandidates(input);
			if (duplicates.length > 0) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${duplicates[0]?.name} is already in the pipeline`,
				});
			}
			const { roleId, stage, ownerUserId, note, ...fields } = input;
			const userId = ctx.session.user.id;

			return dbWs.transaction(async (tx) => {
				const [candidate] = await tx
					.insert(hiringCandidates)
					.values({ ...fields, createdByUserId: userId })
					.returning({ id: hiringCandidates.id });
				if (!candidate) throw new Error("Candidate insert returned no row");

				const [application] = await tx
					.insert(hiringApplications)
					.values({
						candidateId: candidate.id,
						roleId,
						stage,
						ownerUserId: ownerUserId ?? userId,
					})
					.returning({ id: hiringApplications.id });

				if (note) {
					await tx.insert(hiringEvents).values({
						candidateId: candidate.id,
						applicationId: application?.id,
						kind: "note",
						body: note,
						authorUserId: userId,
					});
				}
				return { candidateId: candidate.id };
			});
		}),

	updateCandidate: adminProcedure
		.input(updateCandidateSchema)
		.mutation(async ({ input }) => {
			const { candidateId, ...fields } = input;
			const [updated] = await db
				.update(hiringCandidates)
				.set(fields)
				.where(eq(hiringCandidates.id, candidateId))
				.returning({ id: hiringCandidates.id });
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Candidate not found",
				});
			}
			return updated;
		}),

	addApplication: adminProcedure
		.input(
			z.object({ candidateId: z.string().uuid(), roleId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			const [application] = await db
				.insert(hiringApplications)
				.values({ ...input, ownerUserId: ctx.session.user.id })
				.onConflictDoNothing()
				.returning({ id: hiringApplications.id });
			if (!application) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Candidate is already in this role",
				});
			}
			return application;
		}),

	/** Stage and outcome changes each write an event in the same transaction. */
	updateApplication: adminProcedure
		.input(updateApplicationSchema)
		.mutation(async ({ ctx, input }) => {
			const { applicationId, ...changes } = input;
			return dbWs.transaction(async (tx) => {
				const [current] = await tx
					.select()
					.from(hiringApplications)
					.where(eq(hiringApplications.id, applicationId))
					.for("update");
				if (!current) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Application not found",
					});
				}

				const now = new Date();
				const set: Partial<typeof hiringApplications.$inferInsert> = {
					...changes,
				};
				const events: (typeof hiringEvents.$inferInsert)[] = [];
				const eventBase = {
					candidateId: current.candidateId,
					applicationId,
					authorUserId: ctx.session.user.id,
					occurredAt: now,
				};

				if (changes.stage && changes.stage !== current.stage) {
					set.stageChangedAt = now;
					events.push({
						...eventBase,
						kind: "stage_change",
						metadata: {
							fromStage: current.stage,
							toStage: changes.stage,
						} satisfies HiringEventMetadata,
					});
				}
				if (changes.outcome && changes.outcome !== current.outcome) {
					set.closedAt = changes.outcome === "active" ? null : now;
					events.push({
						...eventBase,
						kind: "outcome_change",
						metadata: {
							fromOutcome: current.outcome,
							toOutcome: changes.outcome,
						} satisfies HiringEventMetadata,
					});
				}

				await tx
					.update(hiringApplications)
					.set(set)
					.where(eq(hiringApplications.id, applicationId));
				if (events.length > 0) await tx.insert(hiringEvents).values(events);
				return { id: applicationId };
			});
		}),

	/** Records a touch: sets last contacted, the next follow-up, and an optional note. */
	logTouch: adminProcedure
		.input(logTouchSchema)
		.mutation(async ({ ctx, input }) => {
			return dbWs.transaction(async (tx) => {
				const now = new Date();
				const [application] = await tx
					.update(hiringApplications)
					.set({
						lastContactedAt: now,
						nextFollowUpOn: input.nextFollowUpOn ?? null,
					})
					.where(eq(hiringApplications.id, input.applicationId))
					.returning({
						id: hiringApplications.id,
						candidateId: hiringApplications.candidateId,
					});
				if (!application) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Application not found",
					});
				}
				await tx.insert(hiringEvents).values({
					candidateId: application.candidateId,
					applicationId: application.id,
					kind: "outreach",
					body: input.note ?? null,
					authorUserId: ctx.session.user.id,
					occurredAt: now,
				});
				return application;
			});
		}),

	addEvent: adminProcedure
		.input(addEventSchema)
		.mutation(async ({ ctx, input }) => {
			const metadata: HiringEventMetadata = {};
			if (input.interviewer) metadata.interviewer = input.interviewer;
			if (input.round) metadata.round = input.round;
			if (input.score) metadata.score = input.score;

			const [event] = await db
				.insert(hiringEvents)
				.values({
					candidateId: input.candidateId,
					applicationId: input.applicationId ?? null,
					kind: input.kind,
					body: input.body,
					metadata: Object.keys(metadata).length > 0 ? metadata : null,
					authorUserId: input.authorLabel ? null : ctx.session.user.id,
					authorLabel: input.authorLabel ?? null,
					occurredAt: input.occurredAt ?? new Date(),
				})
				.returning({ id: hiringEvents.id });
			return event;
		}),

	deleteEvent: adminProcedure
		.input(z.object({ eventId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(hiringEvents)
				.where(
					and(
						eq(hiringEvents.id, input.eventId),
						eq(hiringEvents.authorUserId, ctx.session.user.id),
						inArray(hiringEvents.kind, [
							"note",
							"interview",
							"reply",
							"outreach",
						]),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
