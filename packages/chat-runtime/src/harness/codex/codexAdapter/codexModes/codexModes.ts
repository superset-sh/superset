export const CODEX_MODES = [
	{ id: "read-only", label: "Read Only" },
	{ id: "auto", label: "Auto" },
	{ id: "full-access", label: "Full Access" },
] as const;

export const DEFAULT_CODEX_MODE = "auto";

export type CodexTurnPolicy = {
	approvalPolicy: "untrusted" | "on-request" | "never";
	sandbox: "read-only" | "workspace-write" | "danger-full-access";
};

export function codexTurnPolicy(modeId: string | undefined): CodexTurnPolicy {
	switch (modeId) {
		case "read-only":
			return { approvalPolicy: "on-request", sandbox: "read-only" };
		case "full-access":
			return { approvalPolicy: "never", sandbox: "danger-full-access" };
		default:
			return { approvalPolicy: "on-request", sandbox: "workspace-write" };
	}
}
