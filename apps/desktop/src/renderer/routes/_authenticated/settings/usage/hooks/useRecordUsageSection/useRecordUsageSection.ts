import { useEffect } from "react";
import {
	setUsageLastSection,
	type UsageSection,
} from "../../utils/usageLastSection";

/**
 * Records the section a mounted usage route belongs to, so the dashboard
 * sidebar's Usage entry reopens it. Mount-scoped on purpose: only a route
 * that actually rendered can write, so navigating away (or router exit
 * renders) can never overwrite the remembered section.
 */
export function useRecordUsageSection(section: UsageSection): void {
	useEffect(() => {
		setUsageLastSection(section);
	}, [section]);
}
