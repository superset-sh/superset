import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { AppStoreQr } from "@superset/ui/app-store-qr";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { LuArrowUpRight, LuCheck, LuSmartphone } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useGettingStartedStore } from "renderer/stores/getting-started";

export function MobileSettings() {
	const { t } = useLingui();
	const { hasAccess, isReady, gateFeature } = usePaywall();
	const { tried, markTried } = useGettingStartedStore();
	const confirmed = Boolean(tried & 1);
	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Mobile</Trans>
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans>Your agents, wherever you are.</Trans>
				</p>
			</div>
			<div className="overflow-hidden rounded-xl border border-border">
				<div className="flex items-center gap-3 border-b border-border bg-muted/30 px-6 py-4">
					<LuSmartphone className="size-5" />
					<h3 className="flex-1 text-sm font-medium">
						<Trans>Superset for iPhone</Trans>
					</h3>
					<span className="rounded border border-border px-2 py-0.5 text-xs font-medium">
						Pro
					</span>
				</div>
				{!isReady ? (
					<div className="h-64 animate-pulse bg-muted/20" />
				) : hasAccess(GATED_FEATURES.MOBILE_APP) ? (
					<div className="flex flex-wrap items-center gap-8 p-6">
						<div className="shrink-0 rounded-xl border border-border bg-white p-3">
							<AppStoreQr
								className="size-[180px]"
								label={t({ message: "Scan to download Superset for iPhone" })}
							/>
						</div>
						<div className="min-w-56 flex-1 space-y-4">
							<div className="space-y-2">
								<h4 className="font-medium">
									<Trans>Scan to get the app</Trans>
								</h4>
								<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
									<Trans>
										Scan with your iPhone camera, then sign in with the same
										Superset account and organization.
									</Trans>
								</p>
							</div>
							<Button variant="outline" size="sm" asChild>
								<a
									href={COMPANY.APP_STORE_URL}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Trans>Open App Store</Trans>
									<LuArrowUpRight className="size-3.5" />
								</a>
							</Button>
						</div>
					</div>
				) : (
					<div className="space-y-4 p-6">
						<p className="text-sm text-muted-foreground">
							<Trans>Use Superset on your phone with Pro.</Trans>
						</p>
						<Button
							onClick={() => gateFeature(GATED_FEATURES.MOBILE_APP, () => {})}
						>
							<Trans>Upgrade to Pro</Trans>
						</Button>
					</div>
				)}
			</div>
			{isReady && hasAccess(GATED_FEATURES.MOBILE_APP) && (
				<div className="mt-6 space-y-4">
					<p className="text-sm text-muted-foreground">
						<Trans>
							Enable remote access to reach this computer from your phone. Keep
							this computer awake and Superset running.
						</Trans>
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Button variant="outline" size="sm" asChild>
							<Link to="/settings/security">
								<Trans>Remote Access</Trans>
								<LuArrowUpRight className="size-3.5" />
							</Link>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={confirmed}
							onClick={() => markTried(0)}
						>
							{confirmed ? (
								<>
									<LuCheck className="size-4" />
									<Trans>Mobile setup confirmed</Trans>
								</>
							) : (
								<Trans>I've signed in on my phone</Trans>
							)}
						</Button>
					</div>
				</div>
			)}
			<div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
				<a
					href={`${COMPANY.MARKETING_URL}/mobile`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
				>
					<Trans>Learn more</Trans>
					<LuArrowUpRight className="size-3.5" />
				</a>
				<a
					href={`${COMPANY.DOCS_URL}/remote-access`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
				>
					<Trans>Documentation</Trans>
					<LuArrowUpRight className="size-3.5" />
				</a>
			</div>
		</div>
	);
}
