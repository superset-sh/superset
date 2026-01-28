import { Button } from "@superset/ui/button";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FeaturePreview } from "./components/FeaturePreview";
import { FeatureSidebar } from "./components/FeatureSidebar";
import { FEATURE_ID_MAP, PRO_FEATURES } from "./constants";
import type { GatedFeature } from "./usePaywall";

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

	showPaywallFn = (options: PaywallOptions) => {
		setPaywallOptions(options);
		setIsOpen(true);
	};

	useEffect(() => {
		return () => {
			showPaywallFn = null;
		};
	}, []);

	const initialFeatureId =
		(paywallOptions?.feature && FEATURE_ID_MAP[paywallOptions.feature]) ||
		PRO_FEATURES[0]?.id ||
		"team-collaboration";

	const [selectedFeatureId, setSelectedFeatureId] =
		useState<string>(initialFeatureId);

	useEffect(() => {
		if (paywallOptions?.feature && isOpen) {
			const mappedId =
				FEATURE_ID_MAP[paywallOptions.feature] || PRO_FEATURES[0]?.id;
			if (mappedId) {
				setSelectedFeatureId(mappedId);
			}
		}
	}, [paywallOptions?.feature, isOpen]);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setIsOpen(false);
		}
	};

	const selectedFeature =
		PRO_FEATURES.find((f) => f.id === selectedFeatureId) || PRO_FEATURES[0];

	if (!selectedFeature) {
		return null;
	}

	const handleUpgrade = () => {
		setIsOpen(false);
		navigate({ to: "/settings/billing/plans" });
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden"
				showCloseButton={false}
			>
				<div className="flex">
					<FeatureSidebar
						selectedFeatureId={selectedFeatureId}
						onSelectFeature={setSelectedFeatureId}
					/>
					<FeaturePreview selectedFeature={selectedFeature} />
				</div>

				<div className="box-border flex items-center justify-between border-t bg-background px-5 py-4">
					<Button variant="outline" onClick={() => setIsOpen(false)}>
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
