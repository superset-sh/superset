"use client";

import {
	PRO_FEATURES,
	ProFeaturesDialog,
} from "@superset/ui/pro-features-dialog";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";

interface ProFeaturesPaywallProps {
	featureId: string | null;
	triggerSource: string | null;
	onClose: () => void;
}

export function ProFeaturesPaywall({
	featureId,
	triggerSource,
	onClose,
}: ProFeaturesPaywallProps) {
	const router = useRouter();
	const [selectedFeatureId, setSelectedFeatureId] = useState(
		featureId ?? PRO_FEATURES[0]?.id ?? "",
	);
	const openedAt = useRef(0);
	const viewed = useRef(new Set<string>());

	useEffect(() => {
		if (!featureId) return;
		setSelectedFeatureId(featureId);
		openedAt.current = Date.now();
		viewed.current = new Set([featureId]);
		posthog.capture("paywall_opened", {
			trigger_source: triggerSource,
			feature_id: featureId,
		});
	}, [featureId, triggerSource]);

	const summary = () => ({
		trigger_source: triggerSource,
		feature_id: selectedFeatureId,
		features_viewed_count: viewed.current.size,
		time_spent_ms: Date.now() - openedAt.current,
	});

	return (
		<ProFeaturesDialog
			open={featureId !== null}
			onOpenChange={(open) => {
				if (open) return;
				posthog.capture("paywall_cancelled", summary());
				onClose();
			}}
			selectedFeatureId={selectedFeatureId}
			highlightedFeatureId={featureId ?? selectedFeatureId}
			onSelectFeature={(id) => {
				if (id !== selectedFeatureId) {
					posthog.capture("paywall_feature_clicked", {
						trigger_source: triggerSource,
						feature_id: id,
						previous_feature_id: selectedFeatureId,
					});
					viewed.current.add(id);
				}
				setSelectedFeatureId(id);
			}}
			onUpgrade={() => {
				posthog.capture("paywall_upgrade_clicked", summary());
				onClose();
				router.push("/settings/billing");
			}}
		/>
	);
}
