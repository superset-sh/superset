import { userError } from "../../i18n-error";

export function assertInternal(email: string): void {
	if (!email.toLowerCase().endsWith("@superset.sh")) {
		throw userError({
			code: "FORBIDDEN",
			message: "Cloud workspaces are not available yet",
			i18nKey: "serverError.cloudWorkspace.cloudWorkspacesAreNotAvailableYet",
		});
	}
}

export function assertMember(
	organizationIds: string[],
	organizationId: string,
): void {
	if (!organizationIds.includes(organizationId)) {
		throw userError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
			i18nKey: "serverError.cloudWorkspace.notAMemberOfThisOrganization",
		});
	}
}
