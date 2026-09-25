import { Trans, useLingui } from "@lingui/react/macro";
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
	PULL_REQUEST_REVIEW_FILTERS,
	type PullRequestReviewFilter,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestReviewFilter";

interface ReviewFilterProps {
	value: PullRequestReviewFilter | null;
	onChange: (value: PullRequestReviewFilter | null) => void;
}

export function ReviewFilter({ value, onChange }: ReviewFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const label = getPullRequestReviewFilterLabel(value);
	const options = [
		{
			value: null,
			label: t({
				message: "All reviews",
			}),
		},
		...PULL_REQUEST_REVIEW_FILTERS.map((filter) => ({
			value: filter.value,
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
									className="sr-only"
									onChange={() => {
										onChange(option.value);
										setOpen(false);
									}}
								/>
								<HiCheck className={selected ? "size-4" : "size-4 opacity-0"} />
								<span>{option.label}</span>
							</label>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
