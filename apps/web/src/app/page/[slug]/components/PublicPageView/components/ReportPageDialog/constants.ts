import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type ReportReason =
	| "malware_or_phishing"
	| "spam_or_scam"
	| "impersonation"
	| "sexual_content"
	| "violence_or_harassment"
	| "illegal_content"
	| "copyright"
	| "other";

export const REPORT_REASONS: {
	value: ReportReason;
	label: MessageDescriptor;
}[] = [
	{
		value: "malware_or_phishing",
		label: msg({ message: "Malware or phishing" }),
	},
	{ value: "spam_or_scam", label: msg({ message: "Spam or a scam" }) },
	{ value: "impersonation", label: msg({ message: "Impersonates someone" }) },
	{ value: "sexual_content", label: msg({ message: "Sexual content" }) },
	{
		value: "violence_or_harassment",
		label: msg({ message: "Violence or harassment" }),
	},
	{ value: "illegal_content", label: msg({ message: "Illegal content" }) },
	{ value: "copyright", label: msg({ message: "Copyright or trademark" }) },
	{ value: "other", label: msg({ message: "Something else" }) },
];
