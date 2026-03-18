export function getPathSeparator(absolutePath: string): string {
	return absolutePath.includes("\\") ? "\\" : "/";
}

export function joinAbsolutePath(
	parentAbsolutePath: string,
	name: string,
): string {
	const separator = getPathSeparator(parentAbsolutePath);
	return `${parentAbsolutePath.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export function getBaseName(absolutePath: string): string {
	return absolutePath.split(/[/\\]/).pop() ?? absolutePath;
}

export function getParentPath(absolutePath: string): string {
	const trimmedPath = absolutePath.replace(/[\\/]+$/, "");
	const lastSeparatorIndex = Math.max(
		trimmedPath.lastIndexOf("/"),
		trimmedPath.lastIndexOf("\\"),
	);

	if (lastSeparatorIndex <= 0) {
		return trimmedPath;
	}

	if (/^[A-Za-z]:$/.test(trimmedPath.slice(0, lastSeparatorIndex))) {
		return `${trimmedPath.slice(0, lastSeparatorIndex)}\\`;
	}

	return trimmedPath.slice(0, lastSeparatorIndex);
}

function splitRelativeInputPath(input: string): string[] {
	return input.split(/[\\/]+/).filter(Boolean);
}

function hasTraversalSegment(pathSegments: string[]): boolean {
	return pathSegments.some((segment) => segment === "." || segment === "..");
}

function joinPathSegments(
	parentAbsolutePath: string,
	pathSegments: string[],
): string {
	return pathSegments.reduce(
		(currentAbsolutePath, pathSegment) =>
			joinAbsolutePath(currentAbsolutePath, pathSegment),
		parentAbsolutePath,
	);
}

export interface NewFileTarget {
	targetParentPath: string;
	absolutePath: string;
	fileName: string;
}

export function resolveNewFileTarget(
	parentAbsolutePath: string,
	input: string,
): NewFileTarget | null {
	const pathSegments = splitRelativeInputPath(input.trim());
	if (pathSegments.length === 0 || hasTraversalSegment(pathSegments)) {
		return null;
	}

	const parentSegments = pathSegments.slice(0, -1);
	const fileName = pathSegments[pathSegments.length - 1];
	if (!fileName) {
		return null;
	}

	const targetParentPath =
		parentSegments.length > 0
			? joinPathSegments(parentAbsolutePath, parentSegments)
			: parentAbsolutePath;

	return {
		targetParentPath,
		absolutePath: joinAbsolutePath(targetParentPath, fileName),
		fileName,
	};
}

export function resolveNewDirectoryTarget(
	parentAbsolutePath: string,
	input: string,
): { absolutePath: string } | null {
	const pathSegments = splitRelativeInputPath(input.trim());
	if (pathSegments.length === 0 || hasTraversalSegment(pathSegments)) {
		return null;
	}

	return {
		absolutePath: joinPathSegments(parentAbsolutePath, pathSegments),
	};
}
