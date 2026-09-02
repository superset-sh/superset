"use client";

import { i18n } from "@superset/i18n";
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
			title={i18n._({
				id: "web.design.aiStatusSection.aiStatus",
				message: "AI · Status",
			})}
			description={i18n._({
				id: "web.design.aiStatusSection.loadingAndInFlightActivity",
				message: "Loading and in-flight activity indicators",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.aiStatusSection.loaderBrailleSpinner",
					message: "Loader · Braille Spinner",
				})}
				importPath="@superset/ui/ai-elements/loader"
				description={i18n._({
					id: "web.design.aiStatusSection.alsoSupersetUiAiElements",
					message: "Also: @superset/ui/ai-elements/braille-spinner",
				})}
			>
				<Loader size={16} />
				<Loader size={24} />
				<BrailleSpinner className="text-lg text-muted-foreground" />
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.aiStatusSection.shimmerShimmerLabel",
					message: "Shimmer · Shimmer Label",
				})}
				importPath="@superset/ui/ai-elements/shimmer"
				description={i18n._({
					id: "web.design.aiStatusSection.animatedTextForInFlight",
					message: "Animated text for in-flight agent activity",
				})}
			>
				<div className="flex flex-col items-center gap-3 text-sm">
					<Shimmer>
						{i18n._({
							id: "web.design.aiStatusSection.runningBunTest",
							message: "Running bun test…",
						})}
					</Shimmer>
					<Shimmer variant="text">
						{i18n._({
							id: "web.design.aiStatusSection.thinkingAboutTheApproach",
							message: "Thinking about the approach",
						})}
					</Shimmer>
					<ShimmerLabel isShimmering={false}>
						{i18n._({
							id: "web.design.aiStatusSection.doneIsshimmeringFalse",
							message: "Done (isShimmering=false)",
						})}
					</ShimmerLabel>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
