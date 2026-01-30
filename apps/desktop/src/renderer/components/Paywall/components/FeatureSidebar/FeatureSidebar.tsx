import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import type { ProFeature } from "../../constants";
import { PRO_FEATURES } from "../../constants";

interface FeatureSidebarProps {
	selectedFeatureId: string;
	highlightedFeatureId?: string;
	onSelectFeature: (featureId: string) => void;
}

export function FeatureSidebar({
	selectedFeatureId,
	highlightedFeatureId,
	onSelectFeature,
}: FeatureSidebarProps) {
	const orderedFeatures = useMemo(() => {
		if (!highlightedFeatureId) return PRO_FEATURES;

		const highlighted = PRO_FEATURES.find((f) => f.id === highlightedFeatureId);
		if (!highlighted) return PRO_FEATURES;

		return [
			highlighted,
			...PRO_FEATURES.filter((f) => f.id !== highlightedFeatureId),
		];
	}, [highlightedFeatureId]);

	return (
		<div className="flex flex-col border-r bg-card">
			<div className="px-5 pt-5 pb-2.5">
				<h1 className="mb-0 text-lg font-bold text-foreground">Pro Features</h1>
			</div>

			<div className="flex flex-col gap-2.5 px-5 py-2.5">
				{orderedFeatures.map((proFeature) => (
					<FeatureButton
						key={proFeature.id}
						feature={proFeature}
						isSelected={selectedFeatureId === proFeature.id}
						onSelect={() => onSelectFeature(proFeature.id)}
					/>
				))}
			</div>
		</div>
	);
}

interface FeatureButtonProps {
	feature: ProFeature;
	isSelected: boolean;
	onSelect: () => void;
}

function FeatureButton({ feature, isSelected, onSelect }: FeatureButtonProps) {
	const Icon = feature.icon;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group flex w-[209px] h-16 items-center gap-3 px-4 py-3.5 transition-all duration-200 ease-out",
				"cursor-pointer text-left",
				isSelected
					? "bg-muted text-foreground"
					: "text-foreground/70 hover:text-foreground hover:bg-foreground/5",
			)}
		>
			<Icon
				className={cn(
					"shrink-0 text-xl transition-all duration-200 ease-out",
					isSelected
						? feature.iconColor
						: "text-foreground/40 group-hover:text-foreground/60",
				)}
			/>
			<span className="flex flex-col">
				<span
					className={cn(
						"text-sm font-semibold transition-all duration-200",
						isSelected ? "text-foreground" : "",
					)}
				>
					{feature.title}
				</span>
				{feature.comingSoon && (
					<span className="text-[10px] text-muted-foreground/70 font-normal">
						Coming Soon
					</span>
				)}
			</span>
		</button>
	);
}
