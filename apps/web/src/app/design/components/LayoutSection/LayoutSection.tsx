"use client";

import { AspectRatio } from "@superset/ui/aspect-ratio";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Separator } from "@superset/ui/separator";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

const LOG_LINES = Array.from(
	{ length: 24 },
	(_, i) =>
		`[10:4${i % 10}:0${(i * 7) % 10}] agent step ${i + 1} — edited src/module_${i + 1}.ts`,
);

export function LayoutSection() {
	return (
		<ShowcaseSection
			id="layout"
			index="08"
			title="Layout"
			description="Structure, scrolling, and overflow handling"
		>
			<ComponentCard title="Separator" importPath="@superset/ui/separator">
				<div className="w-full max-w-64">
					<p className="text-sm font-medium">Superset UI</p>
					<p className="text-sm text-muted-foreground">
						Shared component library.
					</p>
					<Separator className="my-3" />
					<div className="flex h-5 items-center gap-3 text-sm">
						<span>Docs</span>
						<Separator orientation="vertical" />
						<span>Source</span>
						<Separator orientation="vertical" />
						<span>Changelog</span>
					</div>
				</div>
			</ComponentCard>

			<ComponentCard
				title="Aspect Ratio"
				importPath="@superset/ui/aspect-ratio"
			>
				<div className="w-full max-w-64">
					<AspectRatio
						ratio={16 / 9}
						className="flex items-center justify-center rounded-lg border bg-muted/40 font-mono text-sm text-muted-foreground"
					>
						16 : 9
					</AspectRatio>
				</div>
			</ComponentCard>

			<ComponentCard title="Scroll Area" importPath="@superset/ui/scroll-area">
				<ScrollArea className="h-40 w-full max-w-72 rounded-md border">
					<div className="p-3 font-mono text-xs leading-5 text-muted-foreground">
						{LOG_LINES.map((line) => (
							<div key={line}>{line}</div>
						))}
					</div>
				</ScrollArea>
			</ComponentCard>

			<ComponentCard
				title="Overflow Fade"
				importPath="@superset/ui/overflow-fade-container"
				description="Also: @superset/ui/overflow-fade-text"
			>
				<div className="w-full max-w-64 space-y-4">
					<OverflowFadeContainer className="flex gap-2 overflow-x-auto pb-1">
						{["terminal", "diff", "notes", "preview", "logs", "settings"].map(
							(tab) => (
								<span
									key={tab}
									className="shrink-0 rounded-md border px-3 py-1 text-xs"
								>
									{tab}
								</span>
							),
						)}
					</OverflowFadeContainer>
					<OverflowFadeText className="block w-full font-mono text-xs text-muted-foreground">
						apps/web/src/app/design/components/LayoutSection/LayoutSection.tsx
					</OverflowFadeText>
				</div>
			</ComponentCard>

			<ComponentCard
				title="Resizable"
				importPath="@superset/ui/resizable"
				span
				bleed
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="min-h-44 rounded-none"
				>
					<ResizablePanel defaultSize={30}>
						<div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
							sidebar
						</div>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel defaultSize={70}>
						<ResizablePanelGroup direction="vertical">
							<ResizablePanel defaultSize={60}>
								<div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
									editor
								</div>
							</ResizablePanel>
							<ResizableHandle withHandle />
							<ResizablePanel defaultSize={40}>
								<div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
									terminal
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ComponentCard>
		</ShowcaseSection>
	);
}
