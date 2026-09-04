"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
			title={i18n._(
				msg({
					message: "Layout",
				}),
			)}
			description={i18n._(
				msg({
					message: "Structure, scrolling, and overflow handling",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Separator",
					}),
				)}
				importPath="@superset/ui/separator"
			>
				<div className="w-full max-w-64">
					<p className="text-sm font-medium">
						<Trans>Superset UI</Trans>
					</p>
					<p className="text-sm text-muted-foreground">
						<Trans>Shared component library.</Trans>
					</p>
					<Separator className="my-3" />
					<div className="flex h-5 items-center gap-3 text-sm">
						<span>
							<Trans>Docs</Trans>
						</span>
						<Separator orientation="vertical" />
						<span>
							<Trans>Source</Trans>
						</span>
						<Separator orientation="vertical" />
						<span>
							<Trans>Changelog</Trans>
						</span>
					</div>
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Aspect Ratio",
					}),
				)}
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

			<ComponentCard
				title={i18n._(
					msg({
						message: "Scroll Area",
					}),
				)}
				importPath="@superset/ui/scroll-area"
			>
				<ScrollArea className="h-40 w-full max-w-72 rounded-md border">
					<div className="p-3 font-mono text-xs leading-5 text-muted-foreground">
						{LOG_LINES.map((line) => (
							<div key={line}>{line}</div>
						))}
					</div>
				</ScrollArea>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Overflow Fade",
					}),
				)}
				importPath="@superset/ui/overflow-fade-container"
				description={i18n._(
					msg({
						message: "Also: @superset/ui/overflow-fade-text",
					}),
				)}
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
						<Trans>
							apps/web/src/app/design/components/LayoutSection/LayoutSection.tsx
						</Trans>
					</OverflowFadeText>
				</div>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Resizable",
					}),
				)}
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
							<Trans>sidebar</Trans>
						</div>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel defaultSize={70}>
						<ResizablePanelGroup direction="vertical">
							<ResizablePanel defaultSize={60}>
								<div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
									<Trans>editor</Trans>
								</div>
							</ResizablePanel>
							<ResizableHandle withHandle />
							<ResizablePanel defaultSize={40}>
								<div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
									<Trans>terminal</Trans>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>
				</ResizablePanelGroup>
			</ComponentCard>
		</ShowcaseSection>
	);
}
