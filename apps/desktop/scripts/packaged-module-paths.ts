import type path from "node:path";

export function isPackagedModulePath(
	root: string,
	filename: string,
	paths: Pick<typeof path, "relative" | "isAbsolute" | "sep">,
) {
	const relative = paths.relative(root, filename);
	return (
		!paths.isAbsolute(relative) &&
		relative !== ".." &&
		!relative.startsWith(`..${paths.sep}`)
	);
}
