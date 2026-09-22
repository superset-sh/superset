import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { AppStoreQr } from "@superset/ui/app-store-qr";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { LuArrowUpRight } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { RemoteAccessSwitch } from "renderer/routes/_authenticated/settings/components/RemoteAccessSwitch";

export function MobileSettings() {
	const { t } = useLingui();
	const { hasAccess, isReady, gateFeature } = usePaywall();
	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Mobile</Trans>
				</h2>
			</div>
			<div className="space-y-6">
				{!isReady ? (
					<div className="h-64 animate-pulse bg-muted/20" />
				) : hasAccess(GATED_FEATURES.MOBILE_APP) ? (
					<section className="space-y-4">
						<h3 className="flex items-center gap-3 font-medium">
							<span
								aria-hidden="true"
								className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
							>
								1
							</span>
							<Trans>Install on your iPhone</Trans>
						</h3>
						<div className="flex flex-wrap items-center gap-6 pl-9">
							<AppStoreQr
								className="size-[180px]"
								label={t({ message: "Scan to download Superset for iPhone" })}
							/>
							<p className="min-w-56 max-w-sm flex-1 text-sm leading-relaxed text-muted-foreground">
								<Trans>
									Scan the QR code, then sign in with the same Superset account
									and select this organization.
								</Trans>
							</p>
						</div>
					</section>
				) : (
					<div className="space-y-4">
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
				<section className="mt-8 space-y-4">
					<h3 className="flex items-center gap-3 font-medium">
						<span
							aria-hidden="true"
							className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
						>
							2
						</span>
						<Trans>Connect this computer</Trans>
					</h3>
					<div className="space-y-4 pl-9">
						<p className="text-sm text-muted-foreground">
							<Trans>
								Enable Remote Access and keep this computer awake with Superset
								running.
							</Trans>
						</p>
						<div className="flex items-center gap-3">
							<RemoteAccessSwitch id="mobile-remote-access" />
							<Label htmlFor="mobile-remote-access">
								<Trans>Remote Access</Trans>
							</Label>
						</div>
					</div>
				</section>
			)}
			<div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
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
