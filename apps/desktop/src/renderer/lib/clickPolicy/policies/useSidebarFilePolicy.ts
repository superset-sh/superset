import { type ClickPolicy, usePolicy } from "./policy";

/**
 * Click policy for sidebar file rows: file tree, changes list, diff header,
 * port badges, etc. Reads `sidebarFileLinks` (4-tier).
 */
export function useSidebarFilePolicy(): ClickPolicy {
	return usePolicy("sidebarFileLinks", "file", "4-tier");
}
