import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import type { ComponentType } from "react";
import type { ProFeature } from "../../constants";
import { PRO_FEATURES } from "../../constants";
import { DitheredBackground } from "./components/DitheredBackground";
import { MobileAppDemo } from "./components/MobileAppDemo";
import { RemoteAccessDemo } from "./components/RemoteAccessDemo";
import { SlackIntegrationDemo } from "./components/SlackIntegrationDemo";
import { TasksDemo } from "./components/TasksDemo";
import { TeamCollaborationDemo } from "./components/TeamCollaborationDemo";

const DEMO_COMPONENTS: Record<string, ComponentType> = {
	"team-collaboration": TeamCollaborationDemo,
	tasks: TasksDemo,
	"slack-integration": SlackIntegrationDemo,
	"remote-access": RemoteAccessDemo,
	"mobile-app": MobileAppDemo,
};

interface FeaturePreviewProps {
	selectedFeature: ProFeature;
}

export function FeaturePreview({ selectedFeature }: FeaturePreviewProps) {
	const { i18n } = useLingui();
	const DemoComponent = DEMO_COMPONENTS[selectedFeature.id];

	return (
		<div className="flex w-[495px] flex-col">
			<div className="relative h-[346px] overflow-hidden bg-[#0a0a0f]">
				{PRO_FEATURES.map((proFeature) => (
					<div
						key={`gradient-${proFeature.id}`}
						className={cn(
							"absolute inset-0 transition-opacity duration-1000 ease-in-out",
							selectedFeature.id === proFeature.id
								? "opacity-100"
								: "opacity-0",
						)}
					>
						<DitheredBackground
							colors={proFeature.gradientColors}
							className="absolute inset-0 w-full h-full"
						/>
					</div>
				))}

				<div className="absolute inset-0 flex items-center justify-center">
					{DemoComponent ? <DemoComponent /> : null}
				</div>
			</div>

			<div className="flex w-full flex-col border-t bg-background px-6 py-4 items-center justify-center">
				<div className="mb-2 flex w-full items-center justify-center gap-2">
					<span className="text-lg font-semibold text-foreground">
						{i18n._(selectedFeature.title)}
					</span>
					<Badge variant="default">
						<Trans>PRO</Trans>
					</Badge>
					{selectedFeature.comingSoon && (
						<Badge variant="secondary" className="text-[10px]">
							<Trans>(Coming Soon)</Trans>
						</Badge>
					)}
				</div>
				<span className="text-center text-sm font-normal text-muted-foreground">
					{i18n._(selectedFeature.description)}
				</span>
			</div>
		</div>
	);
}
