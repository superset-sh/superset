import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { Check, Copy, Gift } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

function buildReferralLink(referralCode: string) {
	return `https://superset.sh/refer/${referralCode}`;
}

export function ReferralBanner() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { copyToClipboard, copied } = useCopyToClipboard();

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganizationId = session?.session?.activeOrganizationId;
	const activeOrganization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);
	const referralCode = activeOrganization?.referralCode;

	if (!referralCode) return null;

	const link = buildReferralLink(referralCode);

	const handleCopy = async () => {
		await copyToClipboard(link);
		toast.success("Referral link copied");
	};

	return (
		<div className="shrink-0 border-t border-border bg-muted/30 px-3 py-3">
			<div className="flex items-start gap-2">
				<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Gift className="size-3.5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-xs font-medium text-foreground">
						Give Superset, get more Superset
					</div>
					<div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
						Send a friend a free month. If they subscribe, you get a free month
						too.
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={handleCopy}
						className="mt-2 h-7 w-full justify-center gap-1.5 text-xs"
					>
						{copied ? (
							<>
								<Check className="size-3" />
								Copied
							</>
						) : (
							<>
								<Copy className="size-3" />
								Copy referral link
							</>
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
