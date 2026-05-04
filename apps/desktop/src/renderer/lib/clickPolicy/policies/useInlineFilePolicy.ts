import { type ClickPolicy, usePolicy } from "./policy";

export function useInlineFilePolicy(): ClickPolicy {
	return usePolicy("fileLinks", "file", "2-tier");
}
