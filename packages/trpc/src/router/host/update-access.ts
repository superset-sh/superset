import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const hostUpdateAuthorizationSchema = z.object({
	organizationId: z.string().uuid(),
	machineId: z.string().min(1),
	userId: z.string().uuid(),
});

export async function authorizeHostUpdate(
	caller: { userId: string; organizationIds: string[] },
	input: { organizationId: string; machineId: string; userId: string },
	isOwner: (
		organizationId: string,
		machineId: string,
		userId: string,
	) => Promise<boolean>,
): Promise<{ allowed: boolean }> {
	if (
		!caller.organizationIds.includes(input.organizationId) ||
		!(await isOwner(input.organizationId, input.machineId, caller.userId))
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only a host owner can authorize an update",
		});
	}
	return {
		allowed: await isOwner(input.organizationId, input.machineId, input.userId),
	};
}
