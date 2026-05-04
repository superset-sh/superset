import { type ClickPolicy, usePolicy } from "./policy";

export function useTerminalFilePolicy(): ClickPolicy {
	return usePolicy("fileLinks", "file", "4-tier");
}
