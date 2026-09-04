import { msg } from "@lingui/core/macro";
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
		i18n._(
			msg({
				message: "Active organization required to create an API key",
			}),
		),
	"serverError.automation.aRunForThisAutomation": () =>
		i18n._(
			msg({
				message: "A run for this automation is already in progress.",
			}),
		),
	"serverError.automation.automationHasNoInstructions": () =>
		i18n._(
			msg({
				message: "Automation has no instructions",
			}),
		),
	"serverError.automation.automationNotFound": () =>
		i18n._(
			msg({
				message: "Automation not found",
			}),
		),
	"serverError.automation.failedToCreateAutomation": () =>
		i18n._(
			msg({
				message: "Failed to create automation",
			}),
		),
	"serverError.automation.targethostidDoesNotMatchTheWorkspace": () =>
		i18n._(
			msg({
				message: "targetHostId does not match the workspace's host",
			}),
		),
	"serverError.automation.triggerNotFound": () =>
		i18n._(
			msg({
				message: "Trigger not found",
			}),
		),
	"serverError.automation.v2projectidDoesNotMatchTheWorkspace": () =>
		i18n._(
			msg({
				message: "v2ProjectId does not match the workspace's project",
			}),
		),
	"serverError.automation.versionNotFound": () =>
		i18n._(
			msg({
				message: "Version not found",
			}),
		),
	"serverError.automation.webhookTriggerNotFound": () =>
		i18n._(
			msg({
				message: "Webhook trigger not found",
			}),
		),
	"serverError.automation.workspaceNotFound": () =>
		i18n._(
			msg({
				message: "Workspace not found",
			}),
		),
	"serverError.automation.youDonTHaveAccess": () =>
		i18n._(
			msg({
				message: "You don't have access to this host",
			}),
		),
	"serverError.billing.noActiveOrganization": () =>
		i18n._(
			msg({
				message: "No active organization",
			}),
		),
	"serverError.billing.noStripeCustomerFound": () =>
		i18n._(
			msg({
				message: "No Stripe customer found",
			}),
		),
	"serverError.billing.onlyOwnersCanManageBilling": () =>
		i18n._(
			msg({
				message: "Only owners can manage billing",
			}),
		),
	"serverError.blaxel.couldNotMintSandboxAccessToken": () =>
		i18n._(
			msg({
				message: "Could not mint sandbox access token",
			}),
		),
	"serverError.blaxel.sandboxPreviewHasNoUrl": () =>
		i18n._(
			msg({
				message: "Sandbox preview has no URL",
			}),
		),
	"serverError.chat.chatSessionNotFound": () =>
		i18n._(
			msg({
				message: "Chat session not found",
			}),
		),
	"serverError.chat.noActiveOrganizationSelected": () =>
		i18n._(
			msg({
				message: "No active organization selected",
			}),
		),
	"serverError.cloudWorkspace.cloudWorkspacesAreNotAvailableYet": () =>
		i18n._(
			msg({
				message: "Cloud workspaces are not available yet",
			}),
		),
	"serverError.cloudWorkspace.couldNotRecordCloudWorkspace": () =>
		i18n._(
			msg({
				message: "Could not record cloud workspace",
			}),
		),
	"serverError.cloudWorkspace.couldNotStartCloudWorkspaceProvisioning": () =>
		i18n._(
			msg({
				message: "Could not start cloud workspace provisioning",
			}),
		),
	"serverError.cloudWorkspace.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
	"serverError.cloudWorkspace.notFound": () =>
		i18n._(
			msg({
				message: "Not found",
			}),
		),
	"serverError.cloudWorkspace.projectNotFoundInThisOrganization": () =>
		i18n._(
			msg({
				message: "Project not found in this organization",
			}),
		),
	"serverError.common.accountIsPendingDeletion": () =>
		i18n._(
			msg({
				message: "Account is pending deletion.",
			}),
		),
	"serverError.common.notAuthenticatedPleaseSignIn": () =>
		i18n._(
			msg({
				message: "Not authenticated. Please sign in.",
			}),
		),
	"serverError.common.notAuthenticatedProvideABearerJwt": () =>
		i18n._(
			msg({
				message:
					"Not authenticated. Provide a bearer JWT, x-api-key, or session.",
			}),
		),
	"serverError.host.failedToEnsureHost": () =>
		i18n._(
			msg({
				message: "Failed to ensure host",
			}),
		),
	"serverError.host.invalidHostid": () =>
		i18n._(
			msg({
				message: "Invalid hostId",
			}),
		),
	"serverError.host.noAccessToThisHost": () =>
		i18n._(
			msg({
				message: "No access to this host",
			}),
		),
	"serverError.host.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
	"serverError.host.onlyTheHostOwnerCanSet": () =>
		i18n._(
			msg({
				message: "Only the host owner can set its wake command",
			}),
		),
	"serverError.integration.adminAccessRequired": () =>
		i18n._(
			msg({
				message: "Admin access required",
			}),
		),
	"serverError.integration.githubInstallationNotFound": () =>
		i18n._(
			msg({
				message: "GitHub installation not found",
			}),
		),
	"serverError.integration.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
	"serverError.integration.onlyOwnersCanDeleteProjects": () =>
		i18n._(
			msg({
				message: "Only owners can delete projects",
			}),
		),
	"serverError.integration.sentryRejectedTheToken": () =>
		i18n._(
			msg({
				message: "Sentry rejected the token",
			}),
		),
	"serverError.leaderboard.notFound": () =>
		i18n._(
			msg({
				message: "Not found",
			}),
		),
	"serverError.leaderboard.notOnTheLeaderboardOptIn": () =>
		i18n._(
			msg({
				message: "Not on the leaderboard. Opt in first.",
			}),
		),
	"serverError.leaderboard.rateLimitExceeded": () =>
		i18n._(
			msg({
				message: "Rate limit exceeded.",
			}),
		),
	"serverError.leaderboard.thatHandleIsTaken": () =>
		i18n._(
			msg({
				message: "That handle is taken.",
			}),
		),
	"serverError.leaderboard.tooManyMachinesPublishing": () =>
		i18n._(
			msg({
				message: "Too many machines publishing for this account.",
			}),
		),
	"serverError.organization.adminsCannotModifyOwners": () =>
		i18n._(
			msg({
				message: "Admins cannot modify owners",
			}),
		),
	"serverError.organization.adminsCannotPromoteMembersToOwner": () =>
		i18n._(
			msg({
				message: "Admins cannot promote members to owner",
			}),
		),
	"serverError.organization.cannotDemoteTheLastOwnerPromote": () =>
		i18n._(
			msg({
				message: "Cannot demote the last owner. Promote someone else first.",
			}),
		),
	"serverError.organization.cannotRemoveTheLastOwnerTransfer": () =>
		i18n._(
			msg({
				message: "Cannot remove the last owner. Transfer ownership first.",
			}),
		),
	"serverError.organization.cannotRemoveYourself": () =>
		i18n._(
			msg({
				message: "Cannot remove yourself",
			}),
		),
	"serverError.organization.createFailed": () =>
		i18n._(
			msg({
				message: "Failed to create organization",
			}),
		),
	"serverError.organization.failedToLeaveOrganization": () =>
		i18n._(
			msg({
				message: "Failed to leave organization",
			}),
		),
	"serverError.organization.failedToUploadLogo": () =>
		i18n._(
			msg({
				message: "Failed to upload logo",
			}),
		),
	"serverError.organization.invitationNotFound": () =>
		i18n._(
			msg({
				message: "Invitation not found",
			}),
		),
	"serverError.organization.managedDomain": () =>
		i18n._(
			msg({
				message:
					"Your account is managed by your organization. Contact your admin to create a new organization.",
			}),
		),
	"serverError.organization.memberNotFound": () =>
		i18n._(
			msg({
				message: "Member not found",
			}),
		),
	"serverError.organization.membersCannotModifyRoles": () =>
		i18n._(
			msg({
				message: "Members cannot modify roles",
			}),
		),
	"serverError.organization.onlyOwnersCanUpdateOrganizationSettings": () =>
		i18n._(
			msg({
				message: "Only owners can update organization settings",
			}),
		),
	"serverError.organization.organizationNotFound": () =>
		i18n._(
			msg({
				message: "Organization not found",
			}),
		),
	"serverError.organization.slugTaken": () =>
		i18n._(
			msg({
				message: "This slug is already taken",
			}),
		),
	"serverError.organization.youAreNotAMember": () =>
		i18n._(
			msg({
				message: "You are not a member of this organization",
			}),
		),
	"serverError.organization.youDonTHavePermission": () =>
		i18n._(
			msg({
				message: "You don't have permission to remove this member",
			}),
		),
	"serverError.page.failedToCreatePage": () =>
		i18n._(
			msg({
				message: "Failed to create page",
			}),
		),
	"serverError.page.failedToRecordPageVersion": () =>
		i18n._(
			msg({
				message: "Failed to record page version",
			}),
		),
	"serverError.page.onlyThePersonWhoCreated": () =>
		i18n._(
			msg({
				message: "Only the person who created this page can change it",
			}),
		),
	"serverError.page.pageContentIsNotAvailable": () =>
		i18n._(
			msg({
				message: "Page content is not available",
			}),
		),
	"serverError.page.pageHasNoVersions": () =>
		i18n._(
			msg({
				message: "Page has no versions",
			}),
		),
	"serverError.page.pageNotFound": () =>
		i18n._(
			msg({
				message: "Page not found",
			}),
		),
	"serverError.page.provideEitherIdOrSlug": () =>
		i18n._(
			msg({
				message: "Provide either id or slug",
			}),
		),
	"serverError.page.thisPageIsBeingPublishedFrom": () =>
		i18n._(
			msg({
				message: "This page is being published from somewhere else — retry",
			}),
		),
	"serverError.page.workspaceNotFound": () =>
		i18n._(
			msg({
				message: "Workspace not found",
			}),
		),
	"serverError.pageComment.commentNotFound": () =>
		i18n._(
			msg({
				message: "Comment not found",
			}),
		),
	"serverError.pageComment.failedToCreateThread": () =>
		i18n._(
			msg({
				message: "Failed to create thread",
			}),
		),
	"serverError.pageComment.onlyTheAuthorCanEdit": () =>
		i18n._(
			msg({
				message: "Only the author can edit a comment",
			}),
		),
	"serverError.pageComment.onlyTheThreadSAuthor": () =>
		i18n._(
			msg({
				message: "Only the thread's author or the page's owner can delete it",
			}),
		),
	"serverError.pageComment.pageNotFound": () =>
		i18n._(
			msg({
				message: "Page not found",
			}),
		),
	"serverError.pageComment.thisThreadHasNotBeenHanded": () =>
		i18n._(
			msg({
				message:
					"This thread is not open to agents. A person has to comment on it before an agent can reply.",
			}),
		),
	"serverError.pageComment.threadNotFound": () =>
		i18n._(
			msg({
				message: "Thread not found",
			}),
		),
	"serverError.support.failedToSavePrompt": () =>
		i18n._(
			msg({
				message: "Failed to save prompt",
			}),
		),
	"serverError.support.failedToSendFeedback": () =>
		i18n._(
			msg({
				message: "Failed to send feedback",
			}),
		),
	"serverError.support.failedToSendMigrationReport": () =>
		i18n._(
			msg({
				message: "Failed to send migration report",
			}),
		),
	"serverError.support.feedbackRateLimitingIsNotConfigured": () =>
		i18n._(
			msg({
				message: "Feedback rate limiting is not configured",
			}),
		),
	"serverError.support.submitPromptRateLimitingIsNot": () =>
		i18n._(
			msg({
				message: "Submit prompt rate limiting is not configured",
			}),
		),
	"serverError.support.supportRateLimitingIsNotConfigured": () =>
		i18n._(
			msg({
				message: "Support rate limiting is not configured",
			}),
		),
	"serverError.support.tooManyFeedbackSubmissionsTryAgain": () =>
		i18n._(
			msg({
				message: "Too many feedback submissions. Try again later.",
			}),
		),
	"serverError.support.tooManyPromptSubmissionsTryAgain": () =>
		i18n._(
			msg({
				message: "Too many prompt submissions. Try again later.",
			}),
		),
	"serverError.support.tooManySupportReportsTryAgain": () =>
		i18n._(
			msg({
				message: "Too many support reports. Try again later.",
			}),
		),
	"serverError.task.failedToGenerateAUniqueTask": () =>
		i18n._(
			msg({
				message: "Failed to generate a unique task slug",
			}),
		),
	"serverError.team.teamNotFoundInThisOrganization": () =>
		i18n._(
			msg({
				message: "Team not found in this organization",
			}),
		),
	"serverError.upload.invalidImageTypeOnlyPngJpeg": () =>
		i18n._(
			msg({
				message: "Invalid image type. Only PNG, JPEG, and WebP are allowed",
			}),
		),
	"serverError.user.failedToUploadAvatar": () =>
		i18n._(
			msg({
				message: "Failed to upload avatar",
			}),
		),
	"serverError.user.theRecoveryPeriodHasEndedContact": () =>
		i18n._(
			msg({
				message: "The recovery period has ended. Contact support@superset.sh.",
			}),
		),
	"serverError.user.userNotFound": () =>
		i18n._(
			msg({
				message: "User not found",
			}),
		),
	"serverError.user.youAreTheOnlyOwner": () =>
		i18n._(
			msg({
				message:
					"You are the only owner of an organization that has other members. Transfer ownership or delete the organization first.",
			}),
		),
	"serverError.v2Host.aHostMustHaveAtLeast": () =>
		i18n._(
			msg({
				message: "A host must have at least one owner.",
			}),
		),
	"serverError.v2Host.hostNotFoundInThisOrganization": () =>
		i18n._(
			msg({
				message: "Host not found in this organization",
			}),
		),
	"serverError.v2Host.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
	"serverError.v2Host.onlyHostOwnersCanChangeMembership": () =>
		i18n._(
			msg({
				message: "Only host owners can change membership",
			}),
		),
	"serverError.v2Host.onlyHostOwnersCanDelete": () =>
		i18n._(
			msg({
				message: "Only host owners can delete this host",
			}),
		),
	"serverError.v2Host.thisUserRunsTheHostService": () =>
		i18n._(
			msg({
				message:
					"This user runs the host service for this device and can't be removed.",
			}),
		),
	"serverError.v2Host.thisUserRunsTheHostService2": () =>
		i18n._(
			msg({
				message:
					"This user runs the host service for this device and must remain an owner.",
			}),
		),
	"serverError.v2Host.userAlreadyHasAccess": () =>
		i18n._(
			msg({
				message: "User already has access to this host",
			}),
		),
	"serverError.v2Host.userIsNotAMember": () =>
		i18n._(
			msg({
				message: "User is not a member of this organization",
			}),
		),
	"serverError.v2Host.userIsNotAMemberOf2": () =>
		i18n._(
			msg({
				message: "User is not a member of this host",
			}),
		),
	"serverError.v2Project.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
	"serverError.v2Workspace.notAMemberOfThisOrganization": () =>
		i18n._(
			msg({
				message: "Not a member of this organization",
			}),
		),
};
