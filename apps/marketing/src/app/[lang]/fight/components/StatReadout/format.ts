import { formatTokens, formatUsd } from "@/app/[lang]/utils/formatUsage";
import type { AxisMeta } from "../../constants";

export function axisFill(axis: AxisMeta, raw: number): number {
	const ratio = Math.min(1, Math.max(0, raw / axis.max));
	return "lowerIsBetter" in axis && axis.lowerIsBetter
		? raw <= 0
			? 0
			: 1 - ratio
		: ratio;
}

export function axisValue(axis: AxisMeta, raw: number): string {
	if (axis.key === "depth") return formatTokens(raw);
	if (axis.key === "cost") return raw > 0 ? formatUsd(raw) : "—";
	if (axis.key === "width") return raw.toFixed(1);
	return String(Math.round(raw));
}
