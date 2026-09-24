import { Trans, useLingui } from "@lingui/react/macro";
import { Download } from "lucide-react";
import Image from "next/image";
import type { BrandAsset } from "../../constants";

interface AssetCardProps {
	asset: BrandAsset;
}

export function AssetCard({ asset }: AssetCardProps) {
	const { t } = useLingui();
	const label = t(asset.label);

	return (
		<li className="flex flex-col border border-border">
			<div
				className={`aspect-[16/10] overflow-hidden ${asset.previewClassName}`}
			>
				<div className="relative size-full">
					<Image
						src={asset.src}
						alt={label}
						fill
						sizes="(min-width: 640px) 50vw, 100vw"
						className="object-contain"
					/>
				</div>
			</div>
			<div className="flex items-end justify-between gap-3 border-border border-t px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="text-foreground text-sm">{label}</p>
					<p className="font-mono text-muted-foreground text-xs">
						PNG · {asset.dimensions}
					</p>
				</div>
				<a
					href={asset.src}
					download={asset.fileName}
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					<Download aria-hidden="true" className="size-4" />
					<Trans>Download</Trans>
				</a>
			</div>
		</li>
	);
}
