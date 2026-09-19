import { sanitizeBranchNameWithMaxLength } from "@superset/shared/workspace-launch";

export function sanitizeCustomBranchName(value: string): string {
	const sanitized = sanitizeBranchNameWithMaxLength(value.trim(), undefined, {
		preserveCase: true,
	});
	return sanitized
		.split("/")
		.map((segment) => segment.replace(/(?:\.lock|\.)+$/g, ""))
		.filter(Boolean)
		.join("/");
}

export function getBranchNameChange(value: string) {
	return {
		branchName: value.replace(/\s+/g, "-"),
		branchNameEdited: true,
	};
}

export function getBranchNameBlur(value: string) {
	const branchName = sanitizeCustomBranchName(value);
	return branchName
		? { branchName }
		: { branchName: "", branchNameEdited: false };
}
