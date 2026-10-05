import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PageReportReason } from "@superset/db/enums";

const REPORT_REASON_LABELS: Record<PageReportReason, MessageDescriptor> = {
	malware_or_phishing: msg({ message: "Malware or phishing" }),
	spam_or_scam: msg({ message: "Spam or a scam" }),
	impersonation: msg({ message: "Impersonates someone" }),
	sexual_content: msg({ message: "Sexual content" }),
	violence_or_harassment: msg({ message: "Violence or harassment" }),
	illegal_content: msg({ message: "Illegal content" }),
	copyright: msg({ message: "Copyright or trademark" }),
	other: msg({ message: "Something else" }),
};

export const REPORT_REASONS = (
	Object.entries(REPORT_REASON_LABELS) as [
		PageReportReason,
		MessageDescriptor,
	][]
).map(([value, label]) => ({ value, label }));
