import { Button } from "@superset/ui/button";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { posthog } from "../../lib/posthog";
import { FeaturePreview } from "./components/FeaturePreview";
import { FeatureSidebar } from "./components/FeatureSidebar";
import type { GatedFeature } from "./constants";
import { FEATURE_ID_MAP, PRO_FEATURES } from "./constants";

type PaywallOptions = {
	feature: GatedFeature;
	context?: Record<string, unknown>;
};

let showPaywallFn: ((options: PaywallOptions) => void) | null = null;

export const Paywall = () => {
	const navigate = useNavigate();
	const [paywallOptions, setPaywallOptions] = useState<PaywallOptions | null>(
		null,
	);
	const [isOpen, setIsOpen] = useState(false);
	const openTimeRef = useRef<number | null>(null);
	const featuresViewedRef = useRef<Set<string>>(new Set());

	showPaywallFn = (options: PaywallOptions) => {
		setPaywallOptions(options);
		setIsOpen(true);
	};

	useEffect(() => {
		return () => {
			showPaywallFn = null;
		};
	}, []);

	const triggerSource = paywallOptions?.feature;
	const initialFeatureId =
		(triggerSource && FEATURE_ID_MAP[triggerSource]) ||
		PRO_FEATURES[0]?.id ||
		"team-collaboration";

	const [selectedFeatureId, setSelectedFeatureId] =
		useState<string>(initialFeatureId);

	// Track paywall_opened when modal opens
	useEffect(() => {
		if (isOpen && paywallOptions) {
			openTimeRef.current = Date.now();
			featuresViewedRef.current = new Set([initialFeatureId]);

			const feature = PRO_FEATURES.find((f) => f.id === initialFeatureId);
			posthog.capture("paywall_opened", {
				trigger_source: paywallOptions.feature,
				feature_id: initialFeatureId,
				feature_title: feature?.title,
			});
		}
	}, [isOpen, paywallOptions, initialFeatureId]);

	useEffect(() => {
		if (paywallOptions?.feature && isOpen) {
			const mappedId =
				FEATURE_ID_MAP[paywallOptions.feature] || PRO_FEATURES[0]?.id;
			if (mappedId) {
				setSelectedFeatureId(mappedId);
			}
		}
	}, [paywallOptions?.feature, isOpen]);

	const handleSelectFeature = (featureId: string) => {
		if (featureId !== selectedFeatureId) {
			const feature = PRO_FEATURES.find((f) => f.id === featureId);
			posthog.capture("paywall_feature_clicked", {
				trigger_source: triggerSource,
				feature_id: featureId,
				feature_title: feature?.title,
				previous_feature_id: selectedFeatureId,
			});
			featuresViewedRef.current.add(featureId);
		}
		setSelectedFeatureId(featureId);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			const timeSpent = openTimeRef.current
				? Date.now() - openTimeRef.current
				: 0;
			posthog.capture("paywall_cancelled", {
				trigger_source: triggerSource,
				feature_id: selectedFeatureId,
				features_viewed_count: featuresViewedRef.current.size,
				time_spent_ms: timeSpent,
			});
			setIsOpen(false);
		}
	};

	const selectedFeature =
		PRO_FEATURES.find((f) => f.id === selectedFeatureId) || PRO_FEATURES[0];

	if (!selectedFeature) {
		return null;
	}

	const handleUpgrade = () => {
		const timeSpent = openTimeRef.current
			? Date.now() - openTimeRef.current
			: 0;
		posthog.capture("paywall_upgrade_clicked", {
			trigger_source: triggerSource,
			feature_id: selectedFeatureId,
			feature_title: selectedFeature.title,
			features_viewed_count: featuresViewedRef.current.size,
			time_spent_ms: timeSpent,
		});
		setIsOpen(false);
		navigate({ to: "/settings/billing/plans" });
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden !rounded-none"
				showCloseButton={false}
			>
				<div className="flex">
					<FeatureSidebar
						selectedFeatureId={selectedFeatureId}
						highlightedFeatureId={initialFeatureId}
						onSelectFeature={handleSelectFeature}
					/>
					<FeaturePreview selectedFeature={selectedFeature} />
				</div>

				<div className="box-border flex items-center justify-between border-t bg-background px-5 py-4">
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleUpgrade}>Get Superset Pro</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export const paywall = (
	feature: GatedFeature,
	context?: Record<string, unknown>,
) => {
	if (!showPaywallFn) {
		console.error(
			"[paywall] Paywall not mounted. Make sure to render <Paywall /> in your app",
		);
		return;
	}
	showPaywallFn({ feature, context });
};
