import { TRPCError } from "@trpc/server";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

type ResourceErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND";
type OrgAccessLevel = "admin" | "member";

export type OrgScopedResource = {
	organizationId: string;
};

type RequireOrgScopedResourceOptions = {
	code?: ResourceErrorCode;
	message: string;
	organizationId?: string;
};

export async function requireOrgScopedResource<T extends OrgScopedResource>(
	resolveResource: () => Promise<T | null | undefined>,
	options: RequireOrgScopedResourceOptions,
): Promise<T> {
	const resource = await resolveResource();

	if (
		!resource ||
		(options.organizationId &&
			resource.organizationId !== options.organizationId)
	) {
		throw new TRPCError({
			code: options.code ?? "NOT_FOUND",
			message: options.message,
		});
	}

	return resource;
}

type RequireOrgResourceAccessOptions = RequireOrgScopedResourceOptions & {
	access?: OrgAccessLevel;
};

export async function requireOrgResourceAccess<T extends OrgScopedResource>(
	userId: string,
	resolveResource: () => Promise<T | null | undefined>,
	options: RequireOrgResourceAccessOptions,
): Promise<T> {
	const resource = await requireOrgScopedResource(resolveResource, options);

	if (options.access === "admin") {
		await verifyOrgAdmin(userId, resource.organizationId);
	} else {
		await verifyOrgMembership(userId, resource.organizationId);
	}

	return resource;
}
