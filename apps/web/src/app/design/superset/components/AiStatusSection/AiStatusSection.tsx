"use client";

import { BrailleSpinner } from "@superset/ui/ai-elements/braille-spinner";
import { Loader } from "@superset/ui/ai-elements/loader";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function AiStatusSection() {
	return (
		<ShowcaseSection
			id="ai-status"
			index="02"
			title="AI · Status"
			description="Loading and in-flight activity indicators"
		>
			<ComponentCard
				title="Loader · Braille Spinner"
				importPath="@superset/ui/ai-elements/loader"
				description="Also: @superset/ui/ai-elements/braille-spinner"
			>
				<Loader size={16} />
				<Loader size={24} />
				<BrailleSpinner className="text-lg text-muted-foreground" />
			</ComponentCard>

			<ComponentCard
				title="Shimmer · Shimmer Label"
				importPath="@superset/ui/ai-elements/shimmer"
				description="Animated text for in-flight agent activity"
			>
				<div className="flex flex-col items-center gap-3 text-sm">
					<Shimmer>Running bun test…</Shimmer>
					<Shimmer variant="text">Thinking about the approach</Shimmer>
					<ShimmerLabel isShimmering={false}>
						Done (isShimmering=false)
					</ShimmerLabel>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
