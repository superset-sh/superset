import {
	formatCount,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";

const TOKEN_SLUGS = new Set(["tokens", "whole-task"]);
const USD_SLUGS = new Set(["spend", "efficient"]);

export function thresholdLabel(slug: string, threshold: number): string {
	if (TOKEN_SLUGS.has(slug)) return formatTokens(threshold);
	if (USD_SLUGS.has(slug)) return formatUsd(threshold);
	return formatCount(threshold);
}
