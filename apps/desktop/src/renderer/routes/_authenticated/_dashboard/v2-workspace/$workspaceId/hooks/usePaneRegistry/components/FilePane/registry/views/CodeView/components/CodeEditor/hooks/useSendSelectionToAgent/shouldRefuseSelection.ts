import type { CapturedEditorSelection } from "../../CodeEditorAdapter";

/** The send affordance's refuse gate. Returns true when send() must be a no-op
 *  rather than format/dispatch.
 *
 *  PR1 ships edge #4 as REFUSE-ONLY (see the design doc, Contract 1). A region
 *  is refused when:
 *    - it is null (edge #1: empty/whitespace selection — capture already
 *      returns null; OR a host with no resolvable selection at all), or
 *    - its `path` is empty/whitespace, or its line range is non-finite
 *      (edge #4: an unresolvable file anchor — defensive, structurally
 *      unreachable in the v2 CodeView host where `ViewProps.filePath` is always
 *      a real on-disk path, but enforced here so a malformed `In undefined:LNaN`
 *      anchor can never reach the formatter).
 *
 *  The text-only fallback (a real selection with no on-disk path) is NOT in PR1;
 *  it is deferred to PR2 hosts that lack a CodeMirror adapter. Until then,
 *  unresolvable-anchor selections are refused, not sent text-only. */
export function shouldRefuseSelection(
	region: CapturedEditorSelection | null | undefined,
): boolean {
	if (!region) return true;
	if (region.path.trim() === "") return true;
	if (!Number.isFinite(region.startLine) || !Number.isFinite(region.endLine)) {
		return true;
	}
	return false;
}
