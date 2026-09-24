import { Trans } from "@lingui/react/macro";
import { SectionHeading } from "../SectionHeading";
import { AssetCard } from "./components/AssetCard";
import { LOGO_ASSETS, PRODUCT_IMAGE_ASSETS } from "./constants";

export function BrandAssetsSection() {
	return (
		<section aria-labelledby="brand-assets">
			<SectionHeading id="brand-assets">
				<Trans>Brand assets</Trans>
			</SectionHeading>
			<p className="mt-6 text-muted-foreground leading-relaxed">
				<Trans>
					Download our logos and product images for use in coverage of Superset.
				</Trans>
			</p>
			<h3 className="mt-8 font-medium text-foreground">
				<Trans>Logos</Trans>
			</h3>
			<ul className="mt-4 grid gap-4 sm:grid-cols-3">
				{LOGO_ASSETS.map((asset) => (
					<AssetCard key={asset.src} asset={asset} />
				))}
			</ul>
			<h3 className="mt-10 font-medium text-foreground">
				<Trans>Product images</Trans>
			</h3>
			<ul className="mt-4 grid gap-4 sm:grid-cols-2 sm:[&>li:first-child]:col-span-2">
				{PRODUCT_IMAGE_ASSETS.map((asset) => (
					<AssetCard key={asset.src} asset={asset} />
				))}
			</ul>
		</section>
	);
}
