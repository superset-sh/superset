import { chatServiceTrpc } from "@superset/chat/client";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { FaAws } from "react-icons/fa";
import { HiArrowUpRight } from "react-icons/hi2";
import { LuCheck } from "react-icons/lu";
import { SiGithub, SiOpenai } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "./components/GhAuthDialog";
import {
	type Provider,
	ProviderConnectModal,
} from "./components/ProviderConnectModal";
import { ClaudeLogo } from "./providers/components/ClaudeLogo";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

function OnboardingDashboardPage() {
	const [connectProvider, setConnectProvider] = useState<Provider | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);

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

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;
	const claudeConnected =
		!!anthropicStatus?.authenticated && !anthropicStatus.issue;
	const codexConnected = !!openAIStatus?.authenticated && !openAIStatus.issue;

	const openGitHubInstall = () => {
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	return (
		<>
			<div className="divide-y divide-border">
				<OnboardingRow
					icon={<SiGithub className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="GitHub CLI"
					description="Clone, push, and create PRs."
					status={rowStatus(isFetchingGh, ghReady)}
					required
					actionLabel={ghInstalled ? "Sign in" : "Install"}
					actionIcon={
						ghInstalled ? undefined : <HiArrowUpRight className="size-3.5" />
					}
					onAction={ghInstalled ? () => setGhAuthOpen(true) : openGitHubInstall}
					onRecheck={() => void refetchGh()}
				/>
				<OnboardingRow
					icon={<ClaudeLogo className="size-4.5 text-white" />}
					chipClassName="bg-[#D97757]"
					name="Claude Code"
					description="Anthropic's coding agent."
					status={rowStatus(isFetchingAnthropic, claudeConnected)}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("anthropic")}
					onRecheck={() => void refetchAnthropic()}
				/>
				<OnboardingRow
					icon={<SiOpenai className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="Codex"
					description="OpenAI's coding agent."
					status={rowStatus(isFetchingOpenAI, codexConnected)}
					actionLabel="Sign in"
					onAction={() => setConnectProvider("openai")}
					onRecheck={() => void refetchOpenAI()}
				/>
				<OnboardingRow
					icon={<FaAws className="size-4.5" />}
					chipClassName="bg-foreground text-background"
					name="More providers"
					description="Bedrock, Vertex, and more."
					status="disconnected"
					actionLabel="Provider docs"
					actionIcon={<HiArrowUpRight className="size-3.5" />}
					onAction={() =>
						window.open(
							"https://docs.superset.sh/providers",
							"_blank",
							"noopener,noreferrer",
						)
					}
				/>
			</div>

			<ProviderConnectModal
				provider={connectProvider}
				onOpenChange={(open) => {
					if (!open) setConnectProvider(null);
				}}
			/>

			<GhAuthDialog
				open={ghAuthOpen}
				onOpenChange={setGhAuthOpen}
				onExit={() => void refetchGh()}
			/>
		</>
	);
}

type RowStatus = "loading" | "connected" | "disconnected";

function rowStatus(isFetching: boolean, connected: boolean): RowStatus {
	if (isFetching) return "loading";
	return connected ? "connected" : "disconnected";
}

interface OnboardingRowProps {
	icon: ReactNode;
	chipClassName?: string;
	name: string;
	description: string;
	status: RowStatus;
	required?: boolean;
	actionLabel: string;
	actionIcon?: ReactNode;
	onAction: () => void;
	onRecheck?: () => void;
}

function OnboardingRow({
	icon,
	chipClassName,
	name,
	description,
	status,
	required,
	actionLabel,
	actionIcon,
	onAction,
	onRecheck,
}: OnboardingRowProps) {
	return (
		<div className="flex items-center gap-4 py-7 first:pt-0 last:pb-0">
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md",
					chipClassName ?? "bg-muted text-foreground",
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{status === "loading" ? (
					<span className="flex items-center gap-1.5 px-3 text-sm text-muted-foreground">
						<Spinner className="size-3.5" />
						Checking…
					</span>
				) : status === "connected" ? (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={onRecheck}
						disabled={!onRecheck}
						className="text-emerald-500 hover:text-emerald-500"
					>
						<LuCheck className="size-3.5" strokeWidth={2.5} />
						Connected
					</Button>
				) : (
					<>
						{required && <Badge variant="outline">Required</Badge>}
						<Button type="button" size="sm" onClick={onAction}>
							{actionLabel}
							{actionIcon}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
