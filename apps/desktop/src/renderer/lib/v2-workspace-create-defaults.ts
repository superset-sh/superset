export type V2WorkspaceCreateBaseBranchSource = "local" | "remote-tracking";

export interface V2WorkspaceCreateBaseBranchDefault {
	branchName: string;
	source: V2WorkspaceCreateBaseBranchSource;
}

const LAST_PROJECT_ID_KEY = "v2-workspace-create:last-project-id";
const BASE_BRANCHES_KEY = "v2-workspace-create:base-branches";

export function getLastProjectId(): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(LAST_PROJECT_ID_KEY);
}

export function setLastProjectId(projectId: string | null): void {
	if (typeof window === "undefined") return;
	if (projectId) {
		window.localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
		return;
	}
	window.localStorage.removeItem(LAST_PROJECT_ID_KEY);
}

function readBaseBranches(): Record<
	string,
	V2WorkspaceCreateBaseBranchDefault
> {
	if (typeof window === "undefined") return {};
	const raw = window.localStorage.getItem(BASE_BRANCHES_KEY);
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Record<
			string,
			V2WorkspaceCreateBaseBranchDefault
		>;
	} catch {
		return {};
	}
}

export function getBaseBranchDefault(
	projectId: string | null,
): V2WorkspaceCreateBaseBranchDefault | null {
	if (!projectId) return null;
	return readBaseBranches()[projectId] ?? null;
}

export function setBaseBranchDefault(
	projectId: string,
	branchName: string,
	source: V2WorkspaceCreateBaseBranchSource,
): void {
	if (typeof window === "undefined") return;
	const trimmed = branchName.trim();
	if (!trimmed) return;
	const map = readBaseBranches();
	map[projectId] = { branchName: trimmed, source };
	window.localStorage.setItem(BASE_BRANCHES_KEY, JSON.stringify(map));
}
