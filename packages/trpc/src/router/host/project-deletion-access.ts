import { TRPCError } from "@trpc/server";

type OwnerCheck = (
	organizationId: string,
	machineId: string,
	userId: string,
) => Promise<boolean>;

export async function authorizeProjectDeletion(
	caller: { userId: string; organizationIds: string[] },
	input: { organizationId: string; machineId: string; userId: string },
	checks: {
		isHostOwner: OwnerCheck;
		isOrganizationOwner: (
			organizationId: string,
			userId: string,
		) => Promise<boolean>;
	},
): Promise<{ allowed: boolean }> {
	if (
		!caller.organizationIds.includes(input.organizationId) ||
		!(await checks.isHostOwner(
			input.organizationId,
			input.machineId,
			caller.userId,
		))
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only a host owner can authorize a project deletion",
		});
	}
	return {
		allowed:
			(await checks.isOrganizationOwner(input.organizationId, input.userId)) ||
			(await checks.isHostOwner(
				input.organizationId,
				input.machineId,
				input.userId,
			)),
	};
}
