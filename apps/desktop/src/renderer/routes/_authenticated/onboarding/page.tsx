import { chatServiceTrpc } from "@superset/chat/client";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { FaAws, FaGithub } from "react-icons/fa";
import { HiArrowUpRight } from "react-icons/hi2";
import { LuCheck } from "react-icons/lu";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	AVAILABLE_RINGTONES,
	useSelectedRingtoneId,
	useSetRingtone,
} from "renderer/stores";
import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useThemeId,
} from "renderer/stores/theme";
import { darkTheme, lightTheme } from "shared/themes";
import {
	type Provider,
	ProviderConnectModal,
} from "./components/ProviderConnectModal";
import { ClaudeBrandIcon } from "./providers/components/ClaudeBrandIcon";
import { CodexBrandIcon } from "./providers/components/CodexBrandIcon";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

function OnboardingDashboardPage() {
	const [connectProvider, setConnectProvider] = useState<Provider | null>(null);

	const {
		data: ghStatus,
		refetch: refetchGh,
		isFetching: isFetchingGh,
	} = electronTrpc.system.detectGhCli.useQuery();
	const {
		data: anthropicStatus,
		refetch: refetchAnthropic,
		isFetching: isFetchingAnthropic,
	} = chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const {
		data: openAIStatus,
		refetch: refetchOpenAI,
		isFetching: isFetchingOpenAI,
	} = chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	const ghReady =
		ghStatus?.installed === true && ghStatus.authenticated === true;
	const claudeConnected =
		!!anthropicStatus?.authenticated && !anthropicStatus.issue;
	const codexConnected = !!openAIStatus?.authenticated && !openAIStatus.issue;

	const openGitHubInstall = () => {
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	return (
		<div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-12 pt-12 pb-6">
			<div className="space-y-2">
				<h1 className="text-[22px] font-semibold text-foreground">
					Setup Superset
				</h1>
				<p className="text-[13px] text-muted-foreground">
					Connect your providers and grant access so Superset can drive your
					terminal and ship code.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<OnboardingTile
					icon={
						<div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
							<FaGithub className="size-3.5" />
						</div>
					}
					name="GitHub CLI"
					description="Clone, push, and create PRs."
					connected={ghReady}
					statusLabel="Connected"
					actionLabel={
						ghStatus?.installed === false
							? "Download"
							: "Sign in (gh auth login)"
					}
					onAction={openGitHubInstall}
					onRecheck={() => void refetchGh()}
					isRechecking={isFetchingGh}
				/>
				<OnboardingTile
					icon={
						<ClaudeBrandIcon
							className="size-6 rounded-md"
							iconClassName="size-3.5"
						/>
					}
					name="Claude Code"
					description="Anthropic's coding agent."
					connected={claudeConnected}
					statusLabel={claudeConnected ? "Connected" : "Not connected"}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("anthropic")}
					onRecheck={() => void refetchAnthropic()}
					isRechecking={isFetchingAnthropic}
				/>
				<OnboardingTile
					icon={
						<CodexBrandIcon
							className="size-6 rounded-md bg-foreground"
							iconClassName="size-3.5 text-background"
						/>
					}
					name="Codex"
					description="OpenAI's coding agent."
					connected={codexConnected}
					statusLabel={codexConnected ? "Connected" : "Not connected"}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("openai")}
					onRecheck={() => void refetchOpenAI()}
					isRechecking={isFetchingOpenAI}
				/>
				<OnboardingTile
					icon={
						<div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
							<FaAws className="size-3.5" />
						</div>
					}
					name="More providers"
					description="Bedrock, Vertex, and more."
					connected={false}
					actionLabel="Provider docs"
					actionArrow
					onAction={() =>
						window.open(
							"https://docs.superset.sh/providers",
							"_blank",
							"noopener,noreferrer",
						)
					}
				/>
			</div>

			<ThemeSection />

			<NotificationSoundSection />

			<ProviderConnectModal
				provider={connectProvider}
				onOpenChange={(open) => {
					if (!open) setConnectProvider(null);
				}}
			/>
		</div>
	);
}

function NotificationSoundSection() {
	const selectedId = useSelectedRingtoneId();
	const setRingtone = useSetRingtone();
	const { data: volumeData } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const volume = volumeData ?? 100;

	const current =
		AVAILABLE_RINGTONES.find((r) => r.id === selectedId) ??
		AVAILABLE_RINGTONES[0];

	const handleChange = (id: string) => {
		setRingtone(id);
		void electronTrpcClient.ringtone.preview.mutate({ ringtoneId: id, volume });
	};

	if (!current) return null;

	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-6">
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">Completion sound</p>
				<p className="text-xs text-muted-foreground">
					Plays when an agent finishes a task.
				</p>
			</div>
			<Select value={selectedId} onValueChange={handleChange}>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue>
						<div className="flex min-w-0 items-center gap-2">
							<span>{current.emoji}</span>
							<span className="truncate text-xs">{current.name}</span>
						</div>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{AVAILABLE_RINGTONES.map((ringtone) => (
						<SelectItem key={ringtone.id} value={ringtone.id}>
							<div className="flex min-w-0 items-center gap-2">
								<span>{ringtone.emoji}</span>
								<span className="truncate">{ringtone.name}</span>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function ThemeSection() {
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();

	const options: { id: string; label: string; preview: ReactNode }[] = [
		{
			id: "light",
			label: "Light",
			preview: <ThemeSwatch theme={lightTheme} />,
		},
		{ id: "dark", label: "Dark", preview: <ThemeSwatch theme={darkTheme} /> },
		{
			id: SYSTEM_THEME_ID,
			label: "System",
			preview: (
				<div className="flex shrink-0 -space-x-1">
					<ThemeSwatch theme={lightTheme} />
					<ThemeSwatch theme={darkTheme} />
				</div>
			),
		},
	];

	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-6">
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">Theme</p>
				<p className="text-xs text-muted-foreground">
					Choose light, dark, or system.
				</p>
			</div>
			<div className="flex items-center gap-2">
				{options.map((opt) => {
					const selected = opt.id === activeThemeId;
					return (
						<button
							key={opt.id}
							type="button"
							onClick={() => setTheme(opt.id)}
							className={cn(
								"inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
								selected
									? "border-foreground bg-accent text-foreground"
									: "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							{opt.preview}
							<span>{opt.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

interface OnboardingTileProps {
	icon: ReactNode;
	name: string;
	description: string;
	connected: boolean;
	statusLabel?: string;
	actionLabel: string;
	actionArrow?: boolean;
	onAction: () => void;
	onRecheck?: () => void;
	isRechecking?: boolean;
}

function OnboardingTile({
	icon,
	name,
	description,
	connected,
	statusLabel,
	actionLabel,
	actionArrow,
	onAction,
	onRecheck,
	isRechecking,
}: OnboardingTileProps) {
	const [holdSpinUntil, setHoldSpinUntil] = useState(0);
	const showSpin = isRechecking === true || Date.now() < holdSpinUntil;

	const handleClick = () => {
		if (connected && onRecheck) {
			setHoldSpinUntil(Date.now() + 500);
			onRecheck();
			window.setTimeout(() => setHoldSpinUntil(0), 500);
		} else {
			onAction();
		}
	};

	return (
		<Card className="gap-0 overflow-hidden rounded-lg! py-0">
			<CardHeader className="gap-1 p-3">
				<CardTitle className="flex items-center gap-2">
					{icon}
					{name}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardFooter className="border-t bg-muted/40 p-0! text-sm">
				<button
					type="button"
					onClick={handleClick}
					className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-accent"
				>
					{connected ? (
						showSpin ? (
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<Spinner className="size-3.5" />
								<span>Loading…</span>
							</div>
						) : (
							<div className="flex items-center gap-1.5 text-emerald-500">
								<LuCheck className="size-3.5" strokeWidth={2.5} />
								<span>{statusLabel}</span>
							</div>
						)
					) : (
						<>
							<span className="text-muted-foreground">{actionLabel}</span>
							{actionArrow && (
								<HiArrowUpRight className="size-3.5 text-muted-foreground" />
							)}
						</>
					)}
				</button>
			</CardFooter>
		</Card>
	);
}
