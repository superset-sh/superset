import { type ClickPolicy, usePolicy } from "./policy";

export function useInlineUrlPolicy(): ClickPolicy {
	return usePolicy("urlLinks", "url", "2-tier");
}
