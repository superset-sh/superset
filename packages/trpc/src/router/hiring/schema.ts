import {
	hiringEventKindEnum,
	hiringOutcomeEnum,
	hiringScoreEnum,
	hiringSourceEnum,
	hiringStageEnum,
} from "@superset/db/enums";
import { z } from "zod";

const optionalText = z
	.string()
	.trim()
	.max(2000)
	.transform((value) => value || null)
	.nullish();

const optionalUrl = z
	.string()
	.trim()
	.max(500)
	.transform((value) => value || null)
	.nullish();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const candidateFieldsSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(320)
		.transform((value) => value || null)
		.nullish(),
	phone: optionalText,
	currentTitle: optionalText,
	currentCompany: optionalText,
	githubUrl: optionalUrl,
	linkedinUrl: optionalUrl,
	xUrl: optionalUrl,
	siteUrl: optionalUrl,
	waasUrl: optionalUrl,
	source: hiringSourceEnum.nullish(),
	referredBy: optionalText,
});

export const createCandidateSchema = candidateFieldsSchema.extend({
	roleId: z.string().uuid(),
	stage: hiringStageEnum.default("sourced"),
	ownerUserId: z.string().uuid().nullish(),
	note: optionalText,
});

export const updateCandidateSchema = candidateFieldsSchema.partial().extend({
	candidateId: z.string().uuid(),
});

export const findDuplicatesSchema = z.object({
	email: z.string().trim().toLowerCase().nullish(),
	githubUrl: z.string().trim().nullish(),
});

export const listApplicationsSchema = z.object({
	q: z.string().trim().max(200).optional(),
	roleId: z.string().uuid().optional(),
	ownerUserId: z.string().uuid().optional(),
	source: hiringSourceEnum.optional(),
	status: z.enum(["active", "closed", "all"]).default("active"),
});

export const updateApplicationSchema = z.object({
	applicationId: z.string().uuid(),
	stage: hiringStageEnum.optional(),
	outcome: hiringOutcomeEnum.optional(),
	score: hiringScoreEnum.nullish(),
	ownerUserId: z.string().uuid().nullish(),
	nextStep: optionalText,
	nextFollowUpOn: isoDate.nullish(),
});

export const logTouchSchema = z.object({
	applicationId: z.string().uuid(),
	nextFollowUpOn: isoDate.nullish(),
	note: optionalText,
});

export const addEventSchema = z.object({
	candidateId: z.string().uuid(),
	applicationId: z.string().uuid().nullish(),
	kind: hiringEventKindEnum.exclude(["stage_change", "outcome_change"]),
	body: z.string().trim().min(1).max(20000),
	interviewer: z.string().trim().max(200).optional(),
	round: z.string().trim().max(200).optional(),
	score: hiringScoreEnum.optional(),
	occurredAt: z.coerce.date().optional(),
	authorLabel: z.string().trim().max(100).optional(),
});
