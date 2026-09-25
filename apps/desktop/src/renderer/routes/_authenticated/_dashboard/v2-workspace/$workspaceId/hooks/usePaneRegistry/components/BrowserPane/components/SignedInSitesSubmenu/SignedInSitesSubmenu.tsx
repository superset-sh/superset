import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { TbX } from "react-icons/tb";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface CookieDomain {
	domain: string;
	cookieCount: number;
}

/** Matches useUrlAutocomplete's cap on rendered rows — a heavily-used session
 * can hold 1000+ cookie domains, and mounting a DropdownMenuItem per row
 * makes the popover visibly slow to open. */
const VISIBLE_LIMIT = 20;

/**
 * Chrome's menu has "Passwords and autofill" — this app has no credential
 * vault (imported "logins" are just Chromium session cookies), so the honest
 * equivalent is listing the sites currently holding one of those cookies.
 */
export function SignedInSitesSubmenu() {
	const { t } = useLingui();
	const [domains, setDomains] = useState<CookieDomain[] | null>(null);
	const [query, setQuery] = useState("");

	const loadDomains = () => {
		electronTrpcClient.browser.getCookieDomains
			.query()
			.then(setDomains)
			.catch(() => setDomains([]));
	};

	const handleForget = (domain: string) => {
		electronTrpcClient.browser.clearCookiesForDomain
			.mutate({ domain })
			.then(loadDomains)
			.catch(() => {
				toast.error(
					t({
						message: `Could not forget ${domain}`,
					}),
				);
			});
	};

	const matches = useMemo(() => {
		if (!domains) return [];
		const q = query.trim().toLowerCase();
		return q
			? domains.filter((d) => d.domain.toLowerCase().includes(q))
			: domains;
	}, [domains, query]);
	const visible = matches.slice(0, VISIBLE_LIMIT);

	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open) loadDomains();
				else setQuery("");
			}}
		>
			<DropdownMenuSubTrigger>
				<Trans>Signed-in sites</Trans>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-72 p-0">
				<div className="p-1">
					<Input
						variant="ghost"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Escape") e.stopPropagation();
						}}
						placeholder={
							domains
								? t({
										message: `Search ${domains.length} sites…`,
									})
								: t({
										message: "Search sites…",
									})
						}
						className="h-7 rounded-md bg-muted/40 px-2"
						spellCheck={false}
						autoComplete="off"
						autoFocus
					/>
				</div>
				<div className="max-h-72 overflow-y-auto px-1 pb-1">
					{domains === null ? (
						<div className="px-2 py-1.5 text-sm text-muted-foreground">
							<Trans>Loading…</Trans>
						</div>
					) : visible.length === 0 ? (
						<div className="px-2 py-1.5 text-sm text-muted-foreground">
							{domains.length === 0 ? (
								<Trans>No sites are signed in</Trans>
							) : (
								<Trans>No matches</Trans>
							)}
						</div>
					) : (
						<>
							{visible.map(({ domain, cookieCount }) => (
								<DropdownMenuItem
									key={domain}
									// Keeping the forget action on the item itself (rather than
									// only the nested button's onClick) is what makes it
									// reachable via arrow-key navigation + Enter/Space — a click
									// anywhere in the row, including the button, already bubbles
									// here, so the button doesn't need its own handler.
									onSelect={(e) => {
										e.preventDefault();
										handleForget(domain);
									}}
									className="justify-between gap-2"
								>
									<span className="min-w-0 truncate">{domain}</span>
									<button
										type="button"
										tabIndex={-1}
										aria-label={t({
											message: `Forget ${domain}`,
										})}
										title={
											cookieCount === 1
												? t({
														message: "1 cookie — forget this site",
													})
												: t({
														message: `${cookieCount} cookies — forget this site`,
													})
										}
										className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
									>
										<TbX className="size-3.5" />
									</button>
								</DropdownMenuItem>
							))}
							{matches.length > VISIBLE_LIMIT && (
								<div className="px-2 py-1.5 text-xs text-muted-foreground/60">
									<Trans>
										{matches.length - VISIBLE_LIMIT} more — refine your search
									</Trans>
								</div>
							)}
						</>
					)}
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
