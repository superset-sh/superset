import { parseGitLabOrigin } from "./ssrf";

export interface GitlabScope {
	groupPath: string | null;
	scopeKind?: "project" | "group";
}

function validPath(path: string): boolean {
	return (
		!Array.from(path).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
		) &&
		!/[%\\?#:\s]/.test(path) &&
		path
			.split("/")
			.every((segment) => segment && segment !== "." && segment !== "..")
	);
}

export function gitlabAccountIdentity(
	host: string,
	kind: "project" | "group",
	path: string,
): string {
	if (!validPath(path) || (kind === "project" && !path.includes("/")))
		throw new Error("Invalid GitLab scope path");
	return `${parseGitLabOrigin(host).host}:${kind}:${path}`;
}

export function gitlabScopeAllows(
	config: GitlabScope,
	projectPath: string | null | undefined,
): boolean {
	if (
		!config.groupPath ||
		!projectPath ||
		!validPath(config.groupPath) ||
		!validPath(projectPath) ||
		!projectPath.includes("/")
	)
		return false;
	if (config.scopeKind === "group")
		return projectPath.startsWith(`${config.groupPath}/`);
	return (
		(config.scopeKind === "project" || config.scopeKind === undefined) &&
		projectPath === config.groupPath
	);
}
