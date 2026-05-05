import { type ClickPolicy, usePolicy } from "./policy";

export function useTerminalUrlPolicy(): ClickPolicy {
	return usePolicy("urlLinks", "url", "4-tier");
}
