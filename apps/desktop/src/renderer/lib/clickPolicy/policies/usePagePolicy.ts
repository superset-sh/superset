import type { TierMode } from "../types";
import { type ClickPolicy, usePolicy } from "./policy";

export function usePagePolicy(mode: TierMode): ClickPolicy {
	return usePolicy("pageLinks", "url", mode);
}
