import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { isMissingProcedureError } from "@/lib/host-service/errors";

/**
 * Names the one host-side failure a user can do something about.
 *
 * Attachments now reach a host through cloud storage, which older
 * host-services have no procedure for. That is a version skew, not a
 * broken attachment, and the fix is on the machine — so say so rather
 * than letting "no procedure found on path" reach the composer.
 */
export function asAttachmentError(error: unknown): unknown {
	if (!isMissingProcedureError(error)) return error;
	return new Error(
		i18n._(
			msg({
				message: "Update Superset on this machine to attach files",
			}),
		),
	);
}
