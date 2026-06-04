import type { HostServiceContext } from "../../../../types";

export type GitClient = Awaited<ReturnType<HostServiceContext["git"]>>;

export type TerminalDescriptor = {
	id: string;
	role: string;
	label: string;
};

export type BranchRow = {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
	isRemote: boolean;
	recency: number | null;
	worktreePath: string | null;
	// True when a workspaces row exists for this (project, branch) on this
	// host. A worktree can exist on disk without one (orphan); the Worktree
	// tab distinguishes Open (hasWorkspace) from Create (orphan adopt).
	hasWorkspace: boolean;
	isCheckedOut: boolean;
};

export type CheckoutResult = {
	workspace: { id: string };
	terminals: TerminalDescriptor[];
	warnings: string[];
	alreadyExists?: false;
};
