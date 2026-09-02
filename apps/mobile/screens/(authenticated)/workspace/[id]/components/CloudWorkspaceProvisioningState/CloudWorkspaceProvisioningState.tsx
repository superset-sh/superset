import { Trans, useLingui } from "@lingui/react/macro";
import { useRouter } from "expo-router";
import {
	AlertCircle,
	Check,
	Cloud,
	GitBranch,
	type LucideIcon,
} from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { cn } from "@/lib/utils";

/**
 * A warm sandbox is up in a second or two; the first ones after an image
 * rebuild pull the image and take tens of seconds. Past this, it is more
 * likely stuck than slow.
 */
const STUCK_AFTER_SECONDS = 45;

/**
 * What a cloud workspace shows between "created" and "openable".
 *
 * The screen is opened the moment the row exists, so this — not a toast, and
 * not the host-offline placeholder — is where the sandbox coming up is
 * visible. Its steps are read off the row's status and whether the sandbox
 * has answered, never a timer, so they can't claim progress that hasn't
 * happened.
 */
export function CloudWorkspaceProvisioningState({
	cloud,
}: {
	cloud: CloudWorkspaceRow;
}) {
	const { t } = useLingui();
	const elapsed = useElapsedSeconds();

	if (cloud.status === "failed") {
		return <CloudWorkspaceFailedState cloud={cloud} />;
	}

	// `ready` means the provider handed back a preview URL, which is a step
	// short of host-service answering on it. Until the sandbox serves the
	// workspace this screen keeps rendering, so the second step is the honest
	// place to be.
	const sandboxReady = cloud.status !== "provisioning";

	return (
		<Frame icon={Cloud} iconClassName="text-muted-foreground">
			<Heading
				title={t({
					message: "Starting workspace",
				})}
				name={cloud.name}
			/>
			<BranchLine branch={cloud.branch} />
			{/* The steps stay left-aligned inside their own column so the icons
			    line up; the column itself sits centered like everything else. */}
			<View className="gap-2.5">
				<StepRow
					label={t({
						message: "Creating sandbox",
					})}
					state={sandboxReady ? "done" : "active"}
				/>
				<StepRow
					label={t({
						message: "Connecting to the workspace",
					})}
					state={sandboxReady ? "active" : "pending"}
				/>
			</View>
			<Text className="text-muted-foreground/80 font-mono text-[11px] tabular-nums">
				{formatElapsed(elapsed)}
			</Text>
			{elapsed >= STUCK_AFTER_SECONDS ? (
				<Text className="text-muted-foreground max-w-[280px] text-center text-xs leading-relaxed">
					<Trans>Taking longer than usual. It keeps going if you leave.</Trans>
				</Text>
			) : null}
		</Frame>
	);
}

/**
 * Provisioning gave up. The row is all that is left of the workspace — the
 * sandbox behind it was torn down when it failed — so the only thing to offer
 * is disposing of it, which is also the only way to clear it from the list.
 */
function CloudWorkspaceFailedState({ cloud }: { cloud: CloudWorkspaceRow }) {
	const { t } = useLingui();
	const router = useRouter();
	const { remove: removeCloudWorkspace } = useCloudWorkspaceActions();
	const [isDeleting, setIsDeleting] = useState(false);

	const remove = async () => {
		setIsDeleting(true);
		try {
			await removeCloudWorkspace(cloud.id);
			router.back();
		} catch {
			Alert.alert(t({ message: "Delete failed" }));
			setIsDeleting(false);
		}
	};

	return (
		<Frame icon={AlertCircle} iconClassName="text-destructive">
			<Heading
				title={t({
					message: "Couldn't start workspace",
				})}
				name={cloud.name}
			/>
			<BranchLine branch={cloud.branch} />
			<Text className="text-muted-foreground max-w-[300px] text-center text-[13px] leading-relaxed">
				<Trans>Nothing is running. Remove it and create a new one.</Trans>
			</Text>
			<Button variant="secondary" disabled={isDeleting} onPress={remove}>
				<Text>
					{isDeleting
						? t({ message: "Removing…" })
						: t({
								message: "Remove workspace",
							})}
				</Text>
			</Button>
		</Frame>
	);
}

function Frame({
	icon,
	iconClassName,
	children,
}: {
	icon: LucideIcon;
	iconClassName: string;
	children: ReactNode;
}) {
	return (
		<View className="flex-1 items-center justify-center px-8">
			<View className="w-full items-center gap-5">
				<Icon
					as={icon}
					className={cn("size-12", iconClassName)}
					strokeWidth={1.25}
				/>
				{children}
			</View>
		</View>
	);
}

function Heading({ title, name }: { title: string; name: string }) {
	const { t } = useLingui();
	return (
		<View className="items-center gap-1">
			<Text className="text-center text-lg font-semibold">{title}</Text>
			<Text
				className="text-muted-foreground text-center text-[15px]"
				numberOfLines={1}
			>
				{name ||
					t({
						message: "Untitled workspace",
					})}
			</Text>
		</View>
	);
}

function BranchLine({ branch }: { branch: string }) {
	if (!branch) return null;
	return (
		<View className="flex-row items-center gap-1.5">
			<Icon
				as={GitBranch}
				className="text-muted-foreground/80 size-3 shrink-0"
				strokeWidth={2}
			/>
			<Text
				className="text-muted-foreground shrink font-mono text-xs"
				numberOfLines={1}
			>
				{branch}
			</Text>
		</View>
	);
}

type StepState = "done" | "active" | "pending";

function StepRow({ label, state }: { label: string; state: StepState }) {
	return (
		<View className="flex-row items-center gap-2.5">
			<StepIcon state={state} />
			<Text
				className={cn(
					"text-[13px] leading-tight",
					state === "done" && "text-foreground/80",
					state === "active" && "text-foreground",
					state === "pending" && "text-muted-foreground/55",
				)}
			>
				{label}
			</Text>
		</View>
	);
}

function StepIcon({ state }: { state: StepState }) {
	if (state === "done") {
		return (
			<View className="bg-foreground/85 size-3.5 shrink-0 items-center justify-center rounded-full">
				<Icon as={Check} className="text-background size-2" strokeWidth={3.5} />
			</View>
		);
	}
	if (state === "active") {
		return (
			<View className="size-3.5 shrink-0 items-center justify-center">
				<ActivityIndicator size={12} />
			</View>
		);
	}
	return (
		<View className="size-3.5 shrink-0 items-center justify-center">
			<View className="bg-muted-foreground/35 size-1.5 rounded-full" />
		</View>
	);
}

function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(total / 60);
	return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * Counts from when this screen appeared, not from the row's `createdAt`: an
 * hours-old cloud workspace renders this too while its sleeping sandbox wakes,
 * and "1:47:12" would be describing the workspace's age, not the wait.
 */
function useElapsedSeconds(): number {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const startedAt = Date.now();
		const id = setInterval(
			() => setElapsed((Date.now() - startedAt) / 1000),
			250,
		);
		return () => clearInterval(id);
	}, []);
	return elapsed;
}
