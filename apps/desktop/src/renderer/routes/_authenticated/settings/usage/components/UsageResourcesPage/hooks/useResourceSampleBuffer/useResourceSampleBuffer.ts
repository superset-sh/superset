import { useEffect, useRef, useState } from "react";
import type { ResourceMetricsSnapshot } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/types";

export interface ResourceSample {
	at: number;
	cpu: number;
	memory: number;
}

// ~5 min of history at the 2 s poll interval.
const MAX_SAMPLES = 150;

/**
 * Rolling in-memory buffer of snapshot totals, one entry per poll. Lives only
 * while the page is mounted — history restarts on revisit, which matches the
 * live-monitor framing (and costs nothing while the page is closed).
 */
export function useResourceSampleBuffer(
	snapshot: ResourceMetricsSnapshot | null,
): ResourceSample[] {
	const [samples, setSamples] = useState<ResourceSample[]>([]);
	const lastCollectedAtRef = useRef(0);

	useEffect(() => {
		if (!snapshot || snapshot.collectedAt === lastCollectedAtRef.current) {
			return;
		}
		lastCollectedAtRef.current = snapshot.collectedAt;
		setSamples((previous) => {
			const next = [
				...previous,
				{
					at: snapshot.collectedAt,
					cpu: snapshot.totalCpu,
					memory: snapshot.totalMemory,
				},
			];
			return next.length > MAX_SAMPLES
				? next.slice(next.length - MAX_SAMPLES)
				: next;
		});
	}, [snapshot]);

	return samples;
}
