export interface ScreenNames {
	workspaceName(id: string): string | null;
	pageTitle(slug: string): string | null;
}

/**
 * What the user is looking at, in words the model can use. Null for screens
 * that say nothing about the work (settings, sign-in).
 */
export function describeScreen(
	pathname: string,
	names: ScreenNames,
): string | null {
	if (pathname === "/" || pathname === "/(home)") {
		return "User is looking at the home list of workspaces.";
	}
	const workspace = pathname.match(/^\/workspace\/([^/]+)(?:\/([^/]+))?/);
	if (workspace) {
		const [, id, sub] = workspace;
		const name = names.workspaceName(id ?? "") ?? "a workspace";
		switch (sub) {
			case undefined:
				return `User is looking at workspace ${name} (its terminal).`;
			case "sessions":
				return `User is looking at the sessions of workspace ${name}.`;
			case "pull-requests":
			case "pull-request":
				return `User is looking at pull requests of workspace ${name}.`;
			case "commits":
				return `User is looking at commits of workspace ${name}.`;
			case "files-changed":
			case "file":
				return `User is looking at the diff of workspace ${name}.`;
			default:
				return `User is in workspace ${name}.`;
		}
	}
	const page = pathname.match(/^\/pages\/([^/]+)/);
	if (page) {
		const title = names.pageTitle(decodeURIComponent(page[1] ?? ""));
		return title
			? `User is looking at the page "${title}".`
			: "User is looking at a published page.";
	}
	if (pathname === "/pages") return "User is looking at the list of pages.";
	return null;
}
