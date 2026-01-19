import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { MeshGradient } from "@superset/ui/mesh-gradient";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { FEATURE_ID_MAP, PRO_FEATURES } from "./constants";
import type { GatedFeature } from "./usePaywall";

type PaywallOptions = {
	feature: GatedFeature;
	context?: Record<string, unknown>;
};

let showPaywallFn: ((options: PaywallOptions) => void) | null = null;

export const Paywall = () => {
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
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent
				className="!w-[744px] !max-w-[744px] p-0 gap-0 overflow-hidden"
				showCloseButton={false}
			>
				<div className="flex">
					<div className="flex flex-col border-r bg-neutral-900">
						<div className="px-5 py-2.5">
							<h1 className="mb-0 mt-1.5 text-lg font-bold text-foreground">
								Pro Features
							</h1>
						</div>

						<div className="flex flex-col gap-2.5 px-5 py-2.5">
							{PRO_FEATURES.map((proFeature) => {
								const Icon = proFeature.icon;
								const isSelected = selectedFeatureId === proFeature.id;

								return (
									<button
										key={proFeature.id}
										type="button"
										onClick={() => setSelectedFeatureId(proFeature.id)}
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
													? proFeature.iconColor
													: "text-foreground/40 group-hover:text-foreground/60",
											)}
										/>
										<span
											className={cn(
												"text-sm font-semibold transition-all duration-200",
												isSelected ? "text-foreground" : "",
											)}
										>
											{proFeature.title}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="flex h-[487px] w-[495px] flex-col">
						<div className="relative h-[346px] overflow-hidden">
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
									<MeshGradient
										colors={proFeature.gradientColors}
										className="absolute inset-0 w-full h-full"
									/>
								</div>
							))}

							<div className="absolute inset-0 flex items-center justify-center">
								<selectedFeature.icon className="text-white/20 text-[120px] select-none pointer-events-none" />
							</div>
						</div>

						<div className="flex min-h-[141px] w-full flex-col border-t bg-background px-6 py-4 items-center justify-center">
							<div className="mb-2 flex w-full items-center justify-center gap-2">
								<span className="text-lg font-semibold text-foreground">
									{selectedFeature.title}
								</span>
								<Badge variant="default">PRO</Badge>
							</div>
							<span className="text-center text-sm font-normal text-muted-foreground">
								{selectedFeature.description}
							</span>
						</div>
					</div>
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
