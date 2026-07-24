import { toAbs } from "../../utils/treePath";

export function resolveRowDragPath(
	treePath: string | null,
	rootPath: string,
): string | null {
	if (!treePath || !rootPath) return null;
	return toAbs(rootPath, treePath);
}
