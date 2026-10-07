import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import {
	HiCheck,
	HiChevronDown,
	HiOutlineChatBubbleLeftRight,
	HiXMark,
} from "react-icons/hi2";
import {
	getPullRequestReviewFilterLabel,
	type PullRequestReviewFilter,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";

import {
	getPullRequestReviewFilterOptions,
	type PullRequestSearchSelection,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter/pullRequestReviewFilter";

interface ReviewFilterProps {
	value: PullRequestReviewFilter | null;
	onChange: (value: PullRequestReviewFilter | null) => void;
	searchSelection?: PullRequestSearchSelection;
}

export function ReviewFilter({
	value,
	onChange,
	searchSelection,
}: ReviewFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const label = getPullRequestReviewFilterLabel(value, searchSelection);
	const available = getPullRequestReviewFilterOptions(searchSelection);
	const currentUnavailable =
		searchSelection?.ready !== false &&
		value !== null &&
		!available.some((option) => option.value === value && !option.disabled);
	const options = [
		{
			value: null,
			disabled: false,
			reason: undefined,
			label: t({
				message: "All reviews",
			}),
		},
		...available.map((filter) => ({
			value: filter.value,
			disabled: filter.disabled,
			reason: filter.reason ? t(filter.reason) : undefined,
			label: t(filter.label),
		})),
	] as const;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={t({
						message: `Reviews: ${label}`,
					})}
					className="h-8 max-w-52 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineChatBubbleLeftRight className="size-4 shrink-0" />
					<span className="truncate text-sm">{label}</span>
					<HiChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-1">
				<div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
					<span className="min-w-0 flex-1 text-sm font-medium">
						<Trans>Filter by reviews</Trans>
					</span>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={t({
							message: "Close review filter",
						})}
						onClick={() => setOpen(false)}
					>
						<HiXMark className="size-4" />
					</Button>
				</div>

				{searchSelection?.hasGitlab && (
					<div className="px-2 py-2 text-xs text-muted-foreground">
						{searchSelection.mode === "mixed" ? (
							<Trans>
								Reviewed filters use GitHub review history and the current
								GitLab review cycle.
							</Trans>
						) : (
							<Trans>
								GitLab reviewed filters use the current review cycle.
							</Trans>
						)}
					</div>
				)}
				{searchSelection?.error && (
					<div role="alert" className="px-2 py-2 text-xs text-destructive">
						{errorMessage(new Error(searchSelection.error))}
					</div>
				)}
				{currentUnavailable && (
					<div role="alert" className="px-2 py-2 text-xs text-muted-foreground">
						<Trans>
							Current review filter is unavailable for this selection. Choose
							All reviews to clear it.
						</Trans>
					</div>
				)}
				<div
					role="radiogroup"
					aria-label={t({
						message: "Filter by reviews",
					})}
					className="py-1"
				>
					{options.map((option) => {
						const selected = option.value === value;
						return (
							<label
								key={option.value ?? "all"}
								className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-within:ring-1 focus-within:ring-ring"
							>
								<input
									type="radio"
									name="pull-request-review-filter"
									value={option.value ?? "all"}
									checked={selected}
									disabled={option.disabled}
									className="sr-only"
									onChange={() => {
										onChange(option.value);
										setOpen(false);
									}}
								/>
								<HiCheck className={selected ? "size-4" : "size-4 opacity-0"} />
								<span>
									{option.label}
									{option.reason && (
										<span className="block text-xs text-muted-foreground">
											{option.reason}
										</span>
									)}
								</span>
							</label>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
