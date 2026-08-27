"use client";

import { Button } from "@superset/ui/button";
import {
	ArrowDown,
	ChevronDown,
	ChevronRight,
	Copy,
	ExternalLink,
	MoreVertical,
	Plus,
	RefreshCw,
	Terminal,
	TriangleAlert,
	X,
} from "lucide-react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function ButtonAuditSection() {
	return (
		<ShowcaseSection
			id="button-audit"
			index="01"
			title="Button — treatments in the wild"
			description="213 files, 449 real <Button> call sites, plus 363 raw <button> occurrences. Sampled below."
		>
			<ComponentCard
				title="1 · Canonical, correct"
				importPath="WorkspacesListView.tsx"
				copyable={false}
				description="variant + size only, no className. This is the target."
			>
				<Button variant="ghost" size="icon" aria-label="More options">
					<MoreVertical />
				</Button>
			</ComponentCard>

			<ComponentCard
				title="2 · Canonical + layout-only className"
				importPath="CommitInput.tsx"
				copyable={false}
				description="flex-1/gap are fine. Real file also adds h-7 text-xs, redundant with size=&quot;sm&quot; — trim on migration."
			>
				<Button variant="secondary" size="sm" className="flex-1 gap-1.5">
					Commit
				</Button>
			</ComponentCard>

			<ComponentCard
				title="3 · Reimplements existing size=&quot;xs&quot;"
				importPath="DeleteWorkspaceDialog.tsx (+6 more, copy-pasted verbatim)"
				copyable={false}
				description="size=&quot;sm&quot; className=&quot;h-7 px-3 text-xs&quot; — size=&quot;xs&quot; already does this correctly."
			>
				<Button variant="ghost" size="sm" className="h-7 px-3 text-xs">
					Cancel
				</Button>
			</ComponentCard>

			<ComponentCard
				title="4 · Undersized icon override"
				importPath="ChangesHeader.tsx, useOrderedSections.tsx"
				copyable={false}
				description="size=&quot;icon&quot; className=&quot;size-6 p-0&quot; — smaller than any defined icon size (icon-xs is size-7)."
			>
				<Button variant="ghost" size="icon" className="size-6 p-0">
					<RefreshCw className="size-3.5" />
				</Button>
			</ComponentCard>

			<ComponentCard
				title="5a · Unofficial &quot;warning&quot; color"
				importPath="PaymentFailedBanner.tsx"
				copyable={false}
				description="No warning variant exists in buttonVariants — this is hand-mixed from tokens."
			>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto h-7 shrink-0 border-warning/40 bg-warning/10 px-2.5 text-xs text-warning hover:bg-warning/20"
				>
					<TriangleAlert className="size-3.5" />
					Update payment
				</Button>
			</ComponentCard>

			<ComponentCard
				title="5b · Unofficial &quot;destructive-ghost&quot; color"
				importPath="FileDiffHeader.tsx"
				copyable={false}
				description="Same problem, different recolor — a second hand-mixed variant that doesn't exist."
			>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 text-destructive hover:text-destructive hover:bg-destructive/10"
				>
					<X className="size-3.5" />
				</Button>
			</ComponentCard>

			<ComponentCard
				title="6 · Hand-built segmented group"
				importPath="AddTabButton.tsx"
				copyable={false}
				description="Fakes ButtonGroup with manual rounded-*-none + shared borders instead of composing it."
				span
			>
				<div className="flex">
					<Button
						variant="ghost"
						className="h-7 gap-1 rounded-r-none border border-border/60 bg-muted/30 pl-2 pr-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
					>
						<Terminal className="size-3.5" />
						Terminal
					</Button>
					<Button
						variant="ghost"
						className="h-7 gap-1 rounded-none border border-l-0 border-border/60 bg-muted/30 px-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
					>
						Browser
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 rounded-l-none border border-l-0 border-border/60 bg-muted/30 px-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
					>
						<ChevronDown className="size-3" />
					</Button>
				</div>
			</ComponentCard>

			<ComponentCard
				title="7 · Bespoke flat-fill icon button"
				importPath="NewWorkspaceButton.tsx"
				copyable={false}
				description="Raw <button>, never touches @superset/ui/button. Flat bg-fill-hover family."
			>
				<button
					type="button"
					className="group flex size-8 items-center justify-center rounded-md bg-fill-hover transition-colors hover:bg-fill-selected"
				>
					<Plus className="size-4" />
				</button>
			</ComponentCard>

			<ComponentCard
				title="8 · Bespoke bordered-circle FAB"
				importPath="ScrollToBottomButton.tsx"
				copyable={false}
				description="Raw <button>. Different family again: full radius, visible border, bg-background."
			>
				<button
					type="button"
					className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<ArrowDown className="size-4" />
				</button>
			</ComponentCard>

			<ComponentCard
				title="9 · Bespoke glass/backdrop-blur toolbar button"
				importPath="CodeBlockView.tsx (independently re-implemented in error.tsx)"
				copyable={false}
				description="Raw <button>. A third distinct family, duplicated by two different authors instead of shared."
			>
				<button
					type="button"
					className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background/80 backdrop-blur transition-colors hover:bg-accent"
				>
					<Copy className="size-3" />
				</button>
			</ComponentCard>

			<ComponentCard
				title="10 · Bespoke borderless hover-icon button"
				importPath="ProjectHeader.tsx"
				copyable={false}
				description="Raw <button>. No default bg/border at all — a fourth family."
			>
				<button
					type="button"
					className="shrink-0 rounded p-1 transition-colors hover:bg-fill-hover"
				>
					<ChevronRight className="size-4 text-muted-foreground" />
				</button>
			</ComponentCard>

			<ComponentCard
				title="11 · Bare, no-chrome clickable icon"
				importPath="MergedPortBadge.tsx, error.tsx, WorkspaceListItem.tsx (div role=&quot;button&quot;)"
				copyable={false}
				description="No radius/padding/bg at all — opacity-0 until group-hover. Hover this card to see it."
			>
				<div className="group flex size-8 items-center justify-center">
					<button
						type="button"
						className="text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
					>
						<ExternalLink className="size-3.5" />
					</button>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
