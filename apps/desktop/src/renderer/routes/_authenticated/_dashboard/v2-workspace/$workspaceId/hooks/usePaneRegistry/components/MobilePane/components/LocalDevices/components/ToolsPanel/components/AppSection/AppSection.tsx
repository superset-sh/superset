import type { DevicePlatform, ForegroundApp } from "@expo/hub-client";
import { useLingui } from "@lingui/react/macro";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { HiChevronRight } from "react-icons/hi2";
import { LuAppWindow } from "react-icons/lu";

interface AppSectionProps {
	app: ForegroundApp;
	platform: DevicePlatform;
}

export function AppSection({ app, platform }: AppSectionProps) {
	const { t } = useLingui();
	const version = [app.version, app.build && `(${app.build})`]
		.filter(Boolean)
		.join(" ");
	const details: Array<{ label: string; value?: string; mono?: boolean }> = [
		{ label: t({ message: "Version" }), value: version },
		platform === "ios"
			? { label: t({ message: "Min iOS" }), value: app.minOS }
			: { label: t({ message: "Min SDK" }), value: app.minSdk?.toString() },
		{ label: t({ message: "Executable" }), value: app.executable },
		{ label: t({ message: "PID" }), value: app.pid?.toString() },
		{
			label: t({ message: "React Native" }),
			value:
				app.isReactNative === undefined
					? undefined
					: app.isReactNative
						? t({ message: "Yes" })
						: t({ message: "No" }),
		},
		{ label: t({ message: "App path" }), value: app.appPath, mono: true },
	];

	return (
		<Collapsible defaultOpen className="group/app">
			<CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
				{app.iconDataUrl ? (
					<img
						src={app.iconDataUrl}
						alt=""
						className="size-8 shrink-0 rounded-md border border-border object-cover"
					/>
				) : (
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
						<LuAppWindow className="size-4" />
					</span>
				)}
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">
						{app.label ?? app.id}
					</span>
					<span className="block truncate font-mono text-xs text-muted-foreground">
						{app.id}
					</span>
				</span>
				<HiChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/app:rotate-90" />
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-1.5 px-3 pb-3">
				{details.map(({ label, value, mono }) => (
					<div
						key={label}
						className="flex min-w-0 items-baseline gap-2 text-xs"
					>
						<span className="w-20 shrink-0 text-muted-foreground">{label}</span>
						{value ? (
							<span
								title={value}
								className={`min-w-0 flex-1 select-text truncate ${mono ? "font-mono" : ""}`}
							>
								{value}
							</span>
						) : (
							<span className="text-muted-foreground/60">—</span>
						)}
					</div>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}
