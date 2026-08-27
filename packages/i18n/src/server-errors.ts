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
	"serverError.organization.createFailed": () =>
		i18n._({
			id: "serverError.organization.createFailed",
			message: "Failed to create organization",
		}),
	"serverError.organization.slugTaken": () =>
		i18n._({
			id: "serverError.organization.slugTaken",
			message: "This slug is already taken",
		}),
};
