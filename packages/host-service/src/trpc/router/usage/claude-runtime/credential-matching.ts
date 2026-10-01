import { ClaudeRuntimeAuthCredentialIdentity } from "./credential-identity";
export interface ClaudeAccountIdentity {
	email?: string | null;
	organizationUuid?: string | null;
}
export class ClaudeRuntimeAuthCredentialMatching extends ClaudeRuntimeAuthCredentialIdentity {
	runtimeCredentialsMatchAccount(
		runtimeCredentialsJson: string,
		runtimeOauthAccount: unknown,
		account: ClaudeAccountIdentity,
		managedCredentialsJson: string,
		managedOauthAccount: unknown,
	): "match" | "mismatch" | "unverifiable" {
		const identity = this.readIdentityFromCredentials(runtimeCredentialsJson);
		if (!identity) {
			return "mismatch";
		}
		const managedIdentity = this.readIdentityFromCredentials(
			managedCredentialsJson,
		);
		const managedOauthIdentity =
			this.readIdentityFromOauthAccount(managedOauthAccount);
		const runtimeOauthIdentity =
			this.readIdentityFromOauthAccount(runtimeOauthAccount);
		const credentialOauthConflict =
			(identity.accountUuid &&
				runtimeOauthIdentity.accountUuid &&
				identity.accountUuid !== runtimeOauthIdentity.accountUuid) ||
			(identity.email &&
				runtimeOauthIdentity.email &&
				identity.email !== runtimeOauthIdentity.email) ||
			(identity.organizationUuid &&
				runtimeOauthIdentity.organizationUuid &&
				identity.organizationUuid !== runtimeOauthIdentity.organizationUuid);
		if (credentialOauthConflict) {
			return "mismatch";
		}

		const selectedOrganizationUuid = this.normalizeField(
			account.organizationUuid ??
				managedIdentity?.organizationUuid ??
				managedOauthIdentity.organizationUuid,
		);
		const oauthAccountMatches =
			Boolean(managedOauthIdentity.accountUuid) &&
			managedOauthIdentity.accountUuid === runtimeOauthIdentity.accountUuid &&
			Boolean(
				runtimeOauthIdentity.email || runtimeOauthIdentity.organizationUuid,
			);
		const runtimeEmail = identity.email ?? runtimeOauthIdentity.email;
		const runtimeOrganizationUuid =
			identity.organizationUuid ?? runtimeOauthIdentity.organizationUuid;
		const refreshTokenComparison = this.compareRefreshTokens(
			runtimeCredentialsJson,
			managedCredentialsJson,
		);
		if (!runtimeEmail) {
			if (refreshTokenComparison === "same") {
				return "match";
			}
			if (identity.organizationUuid) {
				if (
					selectedOrganizationUuid &&
					selectedOrganizationUuid !== identity.organizationUuid
				) {
					return "mismatch";
				}
				return "unverifiable";
			}
			if (oauthAccountMatches) {
				return "match";
			}
			if (!runtimeOrganizationUuid && refreshTokenComparison === "different") {
				return "mismatch";
			}
			return "unverifiable";
		}
		if (account.email && this.normalizeField(account.email) !== runtimeEmail) {
			return "mismatch";
		}
		if (selectedOrganizationUuid && !runtimeOrganizationUuid) {
			return refreshTokenComparison === "same" || oauthAccountMatches
				? "match"
				: "unverifiable";
		}
		if (
			selectedOrganizationUuid &&
			runtimeOrganizationUuid &&
			selectedOrganizationUuid !== runtimeOrganizationUuid
		) {
			return "mismatch";
		}
		if (!selectedOrganizationUuid && runtimeOrganizationUuid) {
			return refreshTokenComparison === "same" ? "match" : "unverifiable";
		}

		return "match";
	}
}
