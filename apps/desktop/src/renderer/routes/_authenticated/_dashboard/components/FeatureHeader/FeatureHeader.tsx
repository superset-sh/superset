import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuChevronDown, LuCircleHelp, LuPlus } from "react-icons/lu";

interface FeatureHeaderProps {
	title: ReactNode;
	docsUrl: string;
	onCreate: () => void;
	isCreating: boolean;
	showCreate?: boolean;
	secondaryAction?: {
		label: ReactNode;
		onSelect: () => void;
		disabled: boolean;
	};
}

export function FeatureHeader({
	title,
	docsUrl,
	onCreate,
	isCreating,
	showCreate = true,
	secondaryAction,
}: FeatureHeaderProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-1.5">
				<h1 className="font-semibold text-xl tracking-tight">{title}</h1>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							asChild
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground/60 hover:text-foreground"
						>
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t({ message: "Documentation" })}
							>
								<LuCircleHelp className="size-3.5" />
							</a>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<Trans>Documentation</Trans>
					</TooltipContent>
				</Tooltip>
			</div>
			{showCreate && (
				<div className="flex items-center">
					<Button
						size="sm"
						disabled={isCreating}
						onClick={onCreate}
						className={secondaryAction ? "rounded-r-none" : undefined}
					>
						<LuPlus className="size-3.5" />
						<Trans>Create with AI</Trans>
					</Button>
					{secondaryAction && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon-sm"
									className="rounded-l-none border-primary-foreground/15 border-l"
									aria-label={t({ message: "More options" })}
								>
									<LuChevronDown className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									disabled={secondaryAction.disabled}
									onSelect={secondaryAction.onSelect}
								>
									<LuPlus className="size-4" />
									{secondaryAction.label}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			)}
		</div>
	);
}
