import { pageShareRoleEnum } from "@superset/db/schema";
import { z } from "zod";

const MAX_GRANTEES_PER_REQUEST = 50;

export const granteeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("user"), userId: z.string().uuid() }),
	z.object({ kind: z.literal("team"), teamId: z.string().uuid() }),
	z.object({ kind: z.literal("invitation"), invitationId: z.string().uuid() }),
]);

export type GranteeRef = z.infer<typeof granteeSchema>;

export const sharingResourceSchema = z.object({ id: z.string().uuid() });

export const addSharesSchema = z.object({
	id: z.string().uuid(),
	grantees: z.array(granteeSchema).min(1).max(MAX_GRANTEES_PER_REQUEST),
});

export const addPageSharesSchema = addSharesSchema.extend({
	role: pageShareRoleEnum.default("comment"),
});

export const removeShareSchema = z.object({
	id: z.string().uuid(),
	grantee: granteeSchema,
});

export const setShareRoleSchema = z.object({
	id: z.string().uuid(),
	grantee: granteeSchema,
	role: pageShareRoleEnum,
});
