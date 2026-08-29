import { i18n } from "./index";

// Catalog entries for user-facing server errors. Each entry pairs a stable
// key with the translation call for it; the extractor reads the i18n._()
// descriptors, so adding a row here is what puts the key into the catalog.
// Servers throw these via userError() in @superset/trpc with the SAME key and
// the SAME English text as `message` (the untranslated fallback) — keep the
// two in sync when editing either.
//
// Key scheme: serverError.<router>.<name>
export const serverErrorMessages: Record<
	string,
	(params?: Record<string, unknown>) => string
> = {
	"serverError.apiKey.activeOrganizationRequiredToCreate": () =>
		i18n._({
			id: "serverError.apiKey.activeOrganizationRequiredToCreate",
			message: "Active organization required to create an API key",
		}),
	"serverError.automation.aRunForThisAutomation": () =>
		i18n._({
			id: "serverError.automation.aRunForThisAutomation",
			message: "A run for this automation is already in progress.",
		}),
	"serverError.automation.automationHasNoInstructions": () =>
		i18n._({
			id: "serverError.automation.automationHasNoInstructions",
			message: "Automation has no instructions",
		}),
	"serverError.automation.automationNotFound": () =>
		i18n._({
			id: "serverError.automation.automationNotFound",
			message: "Automation not found",
		}),
	"serverError.automation.failedToCreateAutomation": () =>
		i18n._({
			id: "serverError.automation.failedToCreateAutomation",
			message: "Failed to create automation",
		}),
	"serverError.automation.targethostidDoesNotMatchTheWorkspace": () =>
		i18n._({
			id: "serverError.automation.targethostidDoesNotMatchTheWorkspace",
			message: "targetHostId does not match the workspace's host",
		}),
	"serverError.automation.triggerNotFound": () =>
		i18n._({
			id: "serverError.automation.triggerNotFound",
			message: "Trigger not found",
		}),
	"serverError.automation.v2projectidDoesNotMatchTheWorkspace": () =>
		i18n._({
			id: "serverError.automation.v2projectidDoesNotMatchTheWorkspace",
			message: "v2ProjectId does not match the workspace's project",
		}),
	"serverError.automation.versionNotFound": () =>
		i18n._({
			id: "serverError.automation.versionNotFound",
			message: "Version not found",
		}),
	"serverError.automation.webhookTriggerNotFound": () =>
		i18n._({
			id: "serverError.automation.webhookTriggerNotFound",
			message: "Webhook trigger not found",
		}),
	"serverError.automation.workspaceNotFound": () =>
		i18n._({
			id: "serverError.automation.workspaceNotFound",
			message: "Workspace not found",
		}),
	"serverError.automation.youDonTHaveAccess": () =>
		i18n._({
			id: "serverError.automation.youDonTHaveAccess",
			message: "You don't have access to this host",
		}),
	"serverError.billing.noActiveOrganization": () =>
		i18n._({
			id: "serverError.billing.noActiveOrganization",
			message: "No active organization",
		}),
	"serverError.billing.noStripeCustomerFound": () =>
		i18n._({
			id: "serverError.billing.noStripeCustomerFound",
			message: "No Stripe customer found",
		}),
	"serverError.billing.onlyOwnersCanManageBilling": () =>
		i18n._({
			id: "serverError.billing.onlyOwnersCanManageBilling",
			message: "Only owners can manage billing",
		}),
	"serverError.blaxel.couldNotMintSandboxAccessToken": () =>
		i18n._({
			id: "serverError.blaxel.couldNotMintSandboxAccessToken",
			message: "Could not mint sandbox access token",
		}),
	"serverError.blaxel.sandboxPreviewHasNoUrl": () =>
		i18n._({
			id: "serverError.blaxel.sandboxPreviewHasNoUrl",
			message: "Sandbox preview has no URL",
		}),
	"serverError.chat.chatSessionNotFound": () =>
		i18n._({
			id: "serverError.chat.chatSessionNotFound",
			message: "Chat session not found",
		}),
	"serverError.chat.failedToRecordChatAttachment": () =>
		i18n._({
			id: "serverError.chat.failedToRecordChatAttachment",
			message: "Failed to record chat attachment",
		}),
	"serverError.chat.noActiveOrganizationSelected": () =>
		i18n._({
			id: "serverError.chat.noActiveOrganizationSelected",
			message: "No active organization selected",
		}),
	"serverError.cloudWorkspace.cloudWorkspacesAreNotAvailableYet": () =>
		i18n._({
			id: "serverError.cloudWorkspace.cloudWorkspacesAreNotAvailableYet",
			message: "Cloud workspaces are not available yet",
		}),
	"serverError.cloudWorkspace.couldNotRecordCloudWorkspace": () =>
		i18n._({
			id: "serverError.cloudWorkspace.couldNotRecordCloudWorkspace",
			message: "Could not record cloud workspace",
		}),
	"serverError.cloudWorkspace.couldNotStartCloudWorkspaceProvisioning": () =>
		i18n._({
			id: "serverError.cloudWorkspace.couldNotStartCloudWorkspaceProvisioning",
			message: "Could not start cloud workspace provisioning",
		}),
	"serverError.cloudWorkspace.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.cloudWorkspace.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
	"serverError.cloudWorkspace.notFound": () =>
		i18n._({
			id: "serverError.cloudWorkspace.notFound",
			message: "Not found",
		}),
	"serverError.cloudWorkspace.projectNotFoundInThisOrganization": () =>
		i18n._({
			id: "serverError.cloudWorkspace.projectNotFoundInThisOrganization",
			message: "Project not found in this organization",
		}),
	"serverError.common.accountIsPendingDeletion": () =>
		i18n._({
			id: "serverError.common.accountIsPendingDeletion",
			message: "Account is pending deletion.",
		}),
	"serverError.common.notAuthenticatedPleaseSignIn": () =>
		i18n._({
			id: "serverError.common.notAuthenticatedPleaseSignIn",
			message: "Not authenticated. Please sign in.",
		}),
	"serverError.common.notAuthenticatedProvideABearerJwt": () =>
		i18n._({
			id: "serverError.common.notAuthenticatedProvideABearerJwt",
			message:
				"Not authenticated. Provide a bearer JWT, x-api-key, or session.",
		}),
	"serverError.host.failedToEnsureHost": () =>
		i18n._({
			id: "serverError.host.failedToEnsureHost",
			message: "Failed to ensure host",
		}),
	"serverError.host.invalidHostid": () =>
		i18n._({
			id: "serverError.host.invalidHostid",
			message: "Invalid hostId",
		}),
	"serverError.host.noAccessToThisHost": () =>
		i18n._({
			id: "serverError.host.noAccessToThisHost",
			message: "No access to this host",
		}),
	"serverError.host.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.host.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
	"serverError.host.onlyTheHostOwnerCanSet": () =>
		i18n._({
			id: "serverError.host.onlyTheHostOwnerCanSet",
			message: "Only the host owner can set its wake command",
		}),
	"serverError.integration.adminAccessRequired": () =>
		i18n._({
			id: "serverError.integration.adminAccessRequired",
			message: "Admin access required",
		}),
	"serverError.integration.githubInstallationNotFound": () =>
		i18n._({
			id: "serverError.integration.githubInstallationNotFound",
			message: "GitHub installation not found",
		}),
	"serverError.integration.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.integration.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
	"serverError.integration.onlyOwnersCanDeleteProjects": () =>
		i18n._({
			id: "serverError.integration.onlyOwnersCanDeleteProjects",
			message: "Only owners can delete projects",
		}),
	"serverError.integration.sentryRejectedTheToken": () =>
		i18n._({
			id: "serverError.integration.sentryRejectedTheToken",
			message: "Sentry rejected the token",
		}),
	"serverError.leaderboard.notFound": () =>
		i18n._({
			id: "serverError.leaderboard.notFound",
			message: "Not found",
		}),
	"serverError.leaderboard.notOnTheLeaderboardOptIn": () =>
		i18n._({
			id: "serverError.leaderboard.notOnTheLeaderboardOptIn",
			message: "Not on the leaderboard. Opt in first.",
		}),
	"serverError.leaderboard.rateLimitExceeded": () =>
		i18n._({
			id: "serverError.leaderboard.rateLimitExceeded",
			message: "Rate limit exceeded.",
		}),
	"serverError.leaderboard.thatHandleIsTaken": () =>
		i18n._({
			id: "serverError.leaderboard.thatHandleIsTaken",
			message: "That handle is taken.",
		}),
	"serverError.leaderboard.tooManyMachinesPublishing": () =>
		i18n._({
			id: "serverError.leaderboard.tooManyMachinesPublishing",
			message: "Too many machines publishing for this account.",
		}),
	"serverError.organization.adminsCannotModifyOwners": () =>
		i18n._({
			id: "serverError.organization.adminsCannotModifyOwners",
			message: "Admins cannot modify owners",
		}),
	"serverError.organization.adminsCannotPromoteMembersToOwner": () =>
		i18n._({
			id: "serverError.organization.adminsCannotPromoteMembersToOwner",
			message: "Admins cannot promote members to owner",
		}),
	"serverError.organization.cannotDemoteTheLastOwnerPromote": () =>
		i18n._({
			id: "serverError.organization.cannotDemoteTheLastOwnerPromote",
			message: "Cannot demote the last owner. Promote someone else first.",
		}),
	"serverError.organization.cannotRemoveTheLastOwnerTransfer": () =>
		i18n._({
			id: "serverError.organization.cannotRemoveTheLastOwnerTransfer",
			message: "Cannot remove the last owner. Transfer ownership first.",
		}),
	"serverError.organization.cannotRemoveYourself": () =>
		i18n._({
			id: "serverError.organization.cannotRemoveYourself",
			message: "Cannot remove yourself",
		}),
	"serverError.organization.createFailed": () =>
		i18n._({
			id: "serverError.organization.createFailed",
			message: "Failed to create organization",
		}),
	"serverError.organization.failedToLeaveOrganization": () =>
		i18n._({
			id: "serverError.organization.failedToLeaveOrganization",
			message: "Failed to leave organization",
		}),
	"serverError.organization.failedToUploadLogo": () =>
		i18n._({
			id: "serverError.organization.failedToUploadLogo",
			message: "Failed to upload logo",
		}),
	"serverError.organization.invitationNotFound": () =>
		i18n._({
			id: "serverError.organization.invitationNotFound",
			message: "Invitation not found",
		}),
	"serverError.organization.managedDomain": () =>
		i18n._({
			id: "serverError.organization.managedDomain",
			message:
				"Your account is managed by your organization. Contact your admin to create a new organization.",
		}),
	"serverError.organization.memberNotFound": () =>
		i18n._({
			id: "serverError.organization.memberNotFound",
			message: "Member not found",
		}),
	"serverError.organization.membersCannotModifyRoles": () =>
		i18n._({
			id: "serverError.organization.membersCannotModifyRoles",
			message: "Members cannot modify roles",
		}),
	"serverError.organization.onlyOwnersCanUpdateOrganizationSettings": () =>
		i18n._({
			id: "serverError.organization.onlyOwnersCanUpdateOrganizationSettings",
			message: "Only owners can update organization settings",
		}),
	"serverError.organization.organizationNotFound": () =>
		i18n._({
			id: "serverError.organization.organizationNotFound",
			message: "Organization not found",
		}),
	"serverError.organization.slugTaken": () =>
		i18n._({
			id: "serverError.organization.slugTaken",
			message: "This slug is already taken",
		}),
	"serverError.organization.youAreNotAMember": () =>
		i18n._({
			id: "serverError.organization.youAreNotAMember",
			message: "You are not a member of this organization",
		}),
	"serverError.organization.youDonTHavePermission": () =>
		i18n._({
			id: "serverError.organization.youDonTHavePermission",
			message: "You don't have permission to remove this member",
		}),
	"serverError.page.failedToCreatePage": () =>
		i18n._({
			id: "serverError.page.failedToCreatePage",
			message: "Failed to create page",
		}),
	"serverError.page.failedToRecordPageVersion": () =>
		i18n._({
			id: "serverError.page.failedToRecordPageVersion",
			message: "Failed to record page version",
		}),
	"serverError.page.onlyThePersonWhoCreated": () =>
		i18n._({
			id: "serverError.page.onlyThePersonWhoCreated",
			message: "Only the person who created this page can change it",
		}),
	"serverError.page.pageContentIsNotAvailable": () =>
		i18n._({
			id: "serverError.page.pageContentIsNotAvailable",
			message: "Page content is not available",
		}),
	"serverError.page.pageHasNoVersions": () =>
		i18n._({
			id: "serverError.page.pageHasNoVersions",
			message: "Page has no versions",
		}),
	"serverError.page.pageNotFound": () =>
		i18n._({
			id: "serverError.page.pageNotFound",
			message: "Page not found",
		}),
	"serverError.page.provideEitherIdOrSlug": () =>
		i18n._({
			id: "serverError.page.provideEitherIdOrSlug",
			message: "Provide either id or slug",
		}),
	"serverError.page.thisPageIsBeingPublishedFrom": () =>
		i18n._({
			id: "serverError.page.thisPageIsBeingPublishedFrom",
			message: "This page is being published from somewhere else — retry",
		}),
	"serverError.page.workspaceNotFound": () =>
		i18n._({
			id: "serverError.page.workspaceNotFound",
			message: "Workspace not found",
		}),
	"serverError.pageComment.commentNotFound": () =>
		i18n._({
			id: "serverError.pageComment.commentNotFound",
			message: "Comment not found",
		}),
	"serverError.pageComment.failedToCreateThread": () =>
		i18n._({
			id: "serverError.pageComment.failedToCreateThread",
			message: "Failed to create thread",
		}),
	"serverError.pageComment.onlyTheAuthorCanEdit": () =>
		i18n._({
			id: "serverError.pageComment.onlyTheAuthorCanEdit",
			message: "Only the author can edit a comment",
		}),
	"serverError.pageComment.onlyTheThreadSAuthor": () =>
		i18n._({
			id: "serverError.pageComment.onlyTheThreadSAuthor",
			message: "Only the thread's author or the page's owner can delete it",
		}),
	"serverError.pageComment.pageNotFound": () =>
		i18n._({
			id: "serverError.pageComment.pageNotFound",
			message: "Page not found",
		}),
	"serverError.pageComment.thisThreadHasNotBeenHanded": () =>
		i18n._({
			id: "serverError.pageComment.thisThreadHasNotBeenHanded",
			message:
				"This thread is not open to agents. A person has to comment on it before an agent can reply.",
		}),
	"serverError.pageComment.threadNotFound": () =>
		i18n._({
			id: "serverError.pageComment.threadNotFound",
			message: "Thread not found",
		}),
	"serverError.support.failedToSavePrompt": () =>
		i18n._({
			id: "serverError.support.failedToSavePrompt",
			message: "Failed to save prompt",
		}),
	"serverError.support.failedToSendFeedback": () =>
		i18n._({
			id: "serverError.support.failedToSendFeedback",
			message: "Failed to send feedback",
		}),
	"serverError.support.failedToSendMigrationReport": () =>
		i18n._({
			id: "serverError.support.failedToSendMigrationReport",
			message: "Failed to send migration report",
		}),
	"serverError.support.feedbackRateLimitingIsNotConfigured": () =>
		i18n._({
			id: "serverError.support.feedbackRateLimitingIsNotConfigured",
			message: "Feedback rate limiting is not configured",
		}),
	"serverError.support.submitPromptRateLimitingIsNot": () =>
		i18n._({
			id: "serverError.support.submitPromptRateLimitingIsNot",
			message: "Submit prompt rate limiting is not configured",
		}),
	"serverError.support.supportRateLimitingIsNotConfigured": () =>
		i18n._({
			id: "serverError.support.supportRateLimitingIsNotConfigured",
			message: "Support rate limiting is not configured",
		}),
	"serverError.support.tooManyFeedbackSubmissionsTryAgain": () =>
		i18n._({
			id: "serverError.support.tooManyFeedbackSubmissionsTryAgain",
			message: "Too many feedback submissions. Try again later.",
		}),
	"serverError.support.tooManyPromptSubmissionsTryAgain": () =>
		i18n._({
			id: "serverError.support.tooManyPromptSubmissionsTryAgain",
			message: "Too many prompt submissions. Try again later.",
		}),
	"serverError.support.tooManySupportReportsTryAgain": () =>
		i18n._({
			id: "serverError.support.tooManySupportReportsTryAgain",
			message: "Too many support reports. Try again later.",
		}),
	"serverError.task.failedToGenerateAUniqueTask": () =>
		i18n._({
			id: "serverError.task.failedToGenerateAUniqueTask",
			message: "Failed to generate a unique task slug",
		}),
	"serverError.team.teamNotFoundInThisOrganization": () =>
		i18n._({
			id: "serverError.team.teamNotFoundInThisOrganization",
			message: "Team not found in this organization",
		}),
	"serverError.upload.invalidImageTypeOnlyPngJpeg": () =>
		i18n._({
			id: "serverError.upload.invalidImageTypeOnlyPngJpeg",
			message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
		}),
	"serverError.uploadBytes.fileIsEmpty": () =>
		i18n._({
			id: "serverError.uploadBytes.fileIsEmpty",
			message: "File is empty",
		}),
	"serverError.user.failedToUploadAvatar": () =>
		i18n._({
			id: "serverError.user.failedToUploadAvatar",
			message: "Failed to upload avatar",
		}),
	"serverError.user.theRecoveryPeriodHasEndedContact": () =>
		i18n._({
			id: "serverError.user.theRecoveryPeriodHasEndedContact",
			message: "The recovery period has ended. Contact support@superset.sh.",
		}),
	"serverError.user.userNotFound": () =>
		i18n._({
			id: "serverError.user.userNotFound",
			message: "User not found",
		}),
	"serverError.user.youAreTheOnlyOwner": () =>
		i18n._({
			id: "serverError.user.youAreTheOnlyOwner",
			message:
				"You are the only owner of an organization that has other members. Transfer ownership or delete the organization first.",
		}),
	"serverError.v2Host.aHostMustHaveAtLeast": () =>
		i18n._({
			id: "serverError.v2Host.aHostMustHaveAtLeast",
			message: "A host must have at least one owner.",
		}),
	"serverError.v2Host.hostNotFoundInThisOrganization": () =>
		i18n._({
			id: "serverError.v2Host.hostNotFoundInThisOrganization",
			message: "Host not found in this organization",
		}),
	"serverError.v2Host.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.v2Host.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
	"serverError.v2Host.onlyHostOwnersCanChangeMembership": () =>
		i18n._({
			id: "serverError.v2Host.onlyHostOwnersCanChangeMembership",
			message: "Only host owners can change membership",
		}),
	"serverError.v2Host.onlyHostOwnersCanDelete": () =>
		i18n._({
			id: "serverError.v2Host.onlyHostOwnersCanDelete",
			message: "Only host owners can delete this host",
		}),
	"serverError.v2Host.thisUserRunsTheHostService": () =>
		i18n._({
			id: "serverError.v2Host.thisUserRunsTheHostService",
			message:
				"This user runs the host service for this device and can't be removed.",
		}),
	"serverError.v2Host.thisUserRunsTheHostService2": () =>
		i18n._({
			id: "serverError.v2Host.thisUserRunsTheHostService2",
			message:
				"This user runs the host service for this device and must remain an owner.",
		}),
	"serverError.v2Host.userAlreadyHasAccess": () =>
		i18n._({
			id: "serverError.v2Host.userAlreadyHasAccess",
			message: "User already has access to this host",
		}),
	"serverError.v2Host.userIsNotAMember": () =>
		i18n._({
			id: "serverError.v2Host.userIsNotAMember",
			message: "User is not a member of this organization",
		}),
	"serverError.v2Host.userIsNotAMemberOf2": () =>
		i18n._({
			id: "serverError.v2Host.userIsNotAMemberOf2",
			message: "User is not a member of this host",
		}),
	"serverError.v2Project.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.v2Project.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
	"serverError.v2Workspace.notAMemberOfThisOrganization": () =>
		i18n._({
			id: "serverError.v2Workspace.notAMemberOfThisOrganization",
			message: "Not a member of this organization",
		}),
};
