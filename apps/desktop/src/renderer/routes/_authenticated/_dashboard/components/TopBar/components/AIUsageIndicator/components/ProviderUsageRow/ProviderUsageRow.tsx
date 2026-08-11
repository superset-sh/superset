import { cn } from "@superset/ui/lib/utils";
import type {
	ProviderUsage,
	ProviderUsageAccount,
} from "lib/trpc/routers/provider-usage.schema";
import type { ReactNode } from "react";
import { AccountUsageBlock } from "./components/AccountUsageBlock";

interface ProviderUsageRowProps {
	provider: ProviderUsage;
	blurEmails?: boolean;
	accountActionsDisabled?: boolean;
	onSwitchProfile?: (profileName: string) => void;
}

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function renderEmailText(value: string, blurEmails: boolean): ReactNode {
	if (!blurEmails) return value;

	const parts: ReactNode[] = [];
	let lastIndex = 0;

	for (const match of value.matchAll(emailPattern)) {
		const email = match[0];
		const index = match.index ?? 0;

		if (index > lastIndex) {
			parts.push(value.slice(lastIndex, index));
		}

		parts.push(
			<span key={`${email}-${index}`} className="inline-block">
				<span
					aria-hidden="true"
					className="inline-block select-none blur-[3px] transition-[filter] duration-150"
				>
					{email}
				</span>
				<span className="sr-only">Email hidden</span>
			</span>,
		);
		lastIndex = index + email.length;
	}

	if (parts.length === 0) return value;
	if (lastIndex < value.length) parts.push(value.slice(lastIndex));
	return parts;
}

function providerStatusLabel(provider: ProviderUsage): string {
	if (provider.status === "ok") return "Connected";
	if (provider.status === "not-configured") return "Not configured";
	return "Temporarily unavailable";
}

export function ProviderUsageRow({
	provider,
	blurEmails = false,
	accountActionsDisabled = false,
	onSwitchProfile,
}: ProviderUsageRowProps) {
	const accounts =
		provider.accounts.length > 0
			? provider.accounts
			: provider.status === "ok"
				? [
						{
							id: `${provider.providerId}:default`,
							providerId: provider.providerId,
							profileName: "default",
							accountLabel: provider.accountLabel,
							planLabel: null,
							isActive: true,
							status: "ok",
							statusMessage: provider.errorMessage,
							windows: provider.windows,
						} satisfies ProviderUsageAccount,
					]
				: [];
	const statusLabel = providerStatusLabel(provider);
	const hasAccountRows = accounts.length > 0;

	return (
		<section className="px-3.5 py-3 border-t border-border/60 first:border-t-0">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0 flex items-baseline gap-2">
					<h5 className="text-xs font-medium text-foreground">
						{provider.providerName}
					</h5>
					{provider.accountLabel && (
						<span className="truncate text-[10px] text-muted-foreground">
							{renderEmailText(provider.accountLabel, blurEmails)}
						</span>
					)}
				</div>
				<span
					className={cn(
						"size-1.5 rounded-full",
						provider.status === "ok"
							? "bg-emerald-500"
							: provider.status === "unavailable"
								? "bg-amber-500"
								: "bg-muted-foreground/40",
					)}
					aria-hidden="true"
					title={statusLabel}
				/>
				<span className="sr-only">{statusLabel}</span>
			</div>

			{hasAccountRows ? (
				<div className="mt-2.5 space-y-3">
					{accounts.map((account) => (
						<AccountUsageBlock
							key={account.id}
							provider={provider}
							account={account}
							blurEmails={blurEmails}
							actionsDisabled={accountActionsDisabled}
							onSwitchProfile={onSwitchProfile}
							renderEmailText={renderEmailText}
						/>
					))}
					{provider.status === "unavailable" && provider.errorMessage && (
						<p className="text-[10px] leading-relaxed text-muted-foreground select-text cursor-text">
							{renderEmailText(provider.errorMessage, blurEmails)}
						</p>
					)}
				</div>
			) : (
				<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground select-text cursor-text">
					{provider.status === "not-configured"
						? `Sign in with ${provider.providerName} CLI to see limits.`
						: provider.errorMessage &&
							renderEmailText(provider.errorMessage, blurEmails)}
				</p>
			)}
		</section>
	);
}
