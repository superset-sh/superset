"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Alerter, alert } from "@superset/ui/atoms/Alert";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { MeshGradient } from "@superset/ui/mesh-gradient";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { toast } from "@superset/ui/sonner";
import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const REFERENCED_ONLY = [
	{
		path: "@superset/ui/form",
		note: "react-hook-form bindings (FormField, FormItem, FormMessage…)",
	},
	{
		path: "@superset/ui/chart",
		note: "Recharts container + tooltip themed via --chart-1…5 tokens",
	},
	{
		path: "@superset/ui/sidebar",
		note: "Full app sidebar system (SidebarProvider, SidebarMenu…)",
	},
];

export function SupersetSection() {
	return (
		<ShowcaseSection
			id="superset"
			index="01"
			title={i18n._(
				msg({
					message: "Superset originals",
				}),
			)}
			description={i18n._(
				msg({
					message: "Custom components beyond the shadcn set",
				}),
			)}
		>
			<Alerter />

			<ComponentCard
				title={i18n._(
					msg({
						message: "Mesh Gradient",
					}),
				)}
				importPath="@superset/ui/mesh-gradient"
				description={i18n._(
					msg({
						message: "Animated WebGL gradient (stripe-gradient)",
					}),
				)}
				bleed
			>
				<MeshGradient
					colors={["#0f172a", "#1e3a5f", "#0e7490", "#164e63"]}
					className="h-48 w-full"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Theme Preview Card",
					}),
				)}
				importPath="@superset/ui/theme-preview-card"
			>
				<ThemePreviewCard
					name="Superset Dark"
					subtitle={i18n._(
						msg({
							message: "Default terminal theme",
						}),
					)}
					backgroundColor="#16161e"
					foregroundColor="#c0caf5"
					promptColor="#7aa2f7"
					infoColor="#e0af68"
					readyColor="#9ece6a"
					palette={[
						"#f7768e",
						"#9ece6a",
						"#e0af68",
						"#7aa2f7",
						"#bb9af7",
						"#7dcfff",
					]}
					className="w-full max-w-72"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Sidebar Card",
					}),
				)}
				importPath="@superset/ui/sidebar-card"
			>
				<SidebarCard
					badge="Beta"
					title={i18n._(
						msg({
							message: "Mobile app",
						}),
					)}
					description={i18n._(
						msg({
							message: "Monitor agents from your phone.",
						}),
					)}
					actionLabel="Join TestFlight"
					onAction={() =>
						toast(
							i18n._(
								msg({
									message: "Opening TestFlight…",
								}),
							),
						)
					}
					onDismiss={() =>
						toast(
							i18n._(
								msg({
									message: "Dismissed",
								}),
							),
						)
					}
					className="w-full max-w-64"
				/>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Alert (imperative)",
					}),
				)}
				importPath="@superset/ui/atoms/Alert"
				description={i18n._(
					msg({
						message:
							"alert() opens a promise-friendly dialog via the mounted Alerter",
					}),
				)}
			>
				<Button
					variant="outline"
					onClick={() =>
						alert({
							title: i18n._(
								msg({
									message: "Discard changes?",
								}),
							),
							description: i18n._(
								msg({
									message:
										"The worktree has uncommitted edits from the agent session.",
								}),
							),
							checkbox: {
								label: i18n._(
									msg({
										message: "Don't ask me again",
									}),
								),
							},
							actions: [
								{
									label: i18n._(
										msg({
											message: "Keep working",
										}),
									),
									variant: "ghost",
								},
								{
									label: i18n._(
										msg({
											message: "Discard",
										}),
									),
									variant: "destructive",
									onClick: ({ checkboxChecked }) => {
										toast(
											checkboxChecked
												? i18n._(
														msg({
															message: "Discarded — won't ask again",
														}),
													)
												: i18n._(
														msg({
															message: "Discarded",
														}),
													),
										);
									},
								},
							],
						})
					}
				>
					<Trans>Trigger alert()</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Avatar (atom)",
					}),
				)}
				importPath="@superset/ui/atoms/Avatar"
				description={i18n._(
					msg({
						message: "Initials fallback via getInitials, sizes xs → xl",
					}),
				)}
			>
				<Avatar size="xs" fullName="Avi Peltz" />
				<Avatar size="sm" fullName="Avi Peltz" />
				<Avatar size="md" fullName="Avi Peltz" />
				<Avatar size="lg" fullName="Avi Peltz" />
				<Avatar size="xl" fullName="Avi Peltz" />
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Referenced, not demoed",
					}),
				)}
				importPath="@superset/ui/*"
				copyable={false}
				description={i18n._(
					msg({
						message:
							"Need app-level wiring (form state, chart data, app shell)",
					}),
				)}
				span
			>
				<div className="w-full space-y-2">
					{REFERENCED_ONLY.map((entry) => (
						<div
							key={entry.path}
							className="flex flex-col gap-0.5 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
						>
							<code className="font-mono text-xs">{entry.path}</code>
							<span className="text-xs text-muted-foreground">
								{entry.note}
							</span>
						</div>
					))}
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
