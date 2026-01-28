import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

function ExpoIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 22"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M11.39 8.269c.19-.277.397-.312.565-.312.168 0 .447.035.637.312 1.49 2.03 3.95 6.075 5.765 9.06 1.184 1.945 2.093 3.44 2.28 3.63.7.714 1.66.269 2.218-.541.549-.797.701-1.357.701-1.954 0-.407-7.958-15.087-8.759-16.309C14.027.98 13.775.683 12.457.683h-.988c-1.315 0-1.505.297-2.276 1.472C8.392 3.377.433 18.057.433 18.463c0 .598.153 1.158.703 1.955.558.81 1.518 1.255 2.218.54.186-.19 1.095-1.684 2.279-3.63 1.815-2.984 4.267-7.029 5.758-9.06z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface ExpoButtonProps {
	workspaceId: string;
	worktreePath: string;
}

type ExpoState = "idle" | "starting" | "running";

const EXPO_COMMAND = "npx expo run:ios --device";

export function ExpoButton({ workspaceId, worktreePath }: ExpoButtonProps) {
	const addTab = useTabsStore((state) => state.addTab);
	const renameTab = useTabsStore((state) => state.renameTab);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const tabs = useTabsStore((state) => state.tabs);

	const [expoState, setExpoState] = useState<ExpoState>("idle");
	const [isHovered, setIsHovered] = useState(false);
	const [activePaneId, setActivePaneId] = useState<string | null>(null);
	const sessionRef = useRef<{ tabId: string; paneId: string } | null>(null);

	const createOrAttach = electronTrpc.terminal.createOrAttach.useMutation({
		onSuccess: () => setExpoState("running"),
		onError: (error) => {
			toast.error(`Failed to start Expo build: ${error.message}`);
			setExpoState("idle");
			sessionRef.current = null;
			setActivePaneId(null);
		},
	});

	const writeMutation = electronTrpc.terminal.write.useMutation({
		onError: (error) => {
			toast.error(`Terminal write failed: ${error.message}`);
		},
	});

	const { data, isLoading } = electronTrpc.workspaces.detectExpo.useQuery({
		worktreePath,
	});

	// Listen for terminal process exit to reset button state
	electronTrpc.terminal.stream.useSubscription(activePaneId ?? "", {
		enabled: !!activePaneId,
		onData: (event) => {
			if (event.type === "exit") {
				setExpoState("idle");
			}
		},
	});

	// Reset state if the tracked tab is closed by the user
	useEffect(() => {
		if (!sessionRef.current) return;
		const tabStillExists = tabs.some((t) => t.id === sessionRef.current?.tabId);
		if (!tabStillExists) {
			setExpoState("idle");
			sessionRef.current = null;
			setActivePaneId(null);
		}
	}, [tabs]);

	const handleStart = useCallback(() => {
		if (createOrAttach.isPending || writeMutation.isPending) return;

		const session = sessionRef.current;

		if (session) {
			setActiveTab(workspaceId, session.tabId);
			setExpoState("starting");
			// \x03 = Ctrl+C (kill any running process), \x15 = Ctrl+U (clear partial input)
			writeMutation.mutate(
				{ paneId: session.paneId, data: `\x03\x15${EXPO_COMMAND}\n` },
				{ onSuccess: () => setExpoState("running") },
			);
		} else {
			setExpoState("starting");
			const { tabId, paneId } = addTab(workspaceId);
			sessionRef.current = { tabId, paneId };
			setActivePaneId(paneId);
			createOrAttach.mutate({
				paneId,
				tabId,
				workspaceId,
				initialCommands: [EXPO_COMMAND],
			});
			renameTab(tabId, "Expo iOS");
		}
	}, [workspaceId, addTab, renameTab, setActiveTab, createOrAttach, writeMutation]);

	const handleStop = useCallback(() => {
		const session = sessionRef.current;
		if (!session || writeMutation.isPending) return;

		// \x03 = Ctrl+C — terminal driver sends SIGINT to the foreground process group
		writeMutation.mutate(
			{ paneId: session.paneId, data: "\x03" },
			{ onSuccess: () => setExpoState("idle") },
		);
	}, [writeMutation]);

	const handleClick = useCallback(() => {
		if (expoState === "running" && isHovered) {
			handleStop();
		} else if (expoState === "idle") {
			handleStart();
		}
	}, [expoState, isHovered, handleStart, handleStop]);

	// Hide button if loading or no Expo detected
	if (isLoading || !data?.hasExpo) {
		return null;
	}

	const isDisabled = expoState === "starting" || writeMutation.isPending;
	const showStop = expoState === "running" && isHovered;

	let tooltipText: string;
	if (isDisabled) {
		tooltipText =
			expoState === "starting" ? "Starting Expo..." : "Stopping Expo...";
	} else if (showStop) {
		tooltipText = "Stop Expo build";
	} else if (expoState === "running") {
		tooltipText = "Expo build running";
	} else {
		tooltipText = "Run on iOS Device";
	}

	return (
		<div className="no-drag">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						onMouseEnter={() => setIsHovered(true)}
						onMouseLeave={() => setIsHovered(false)}
						disabled={isDisabled}
						className={cn(
							"flex items-center justify-center size-6 rounded border",
							"transition-colors duration-150 ease-out",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							isDisabled && "opacity-50 pointer-events-none",
							showStop
								? "border-red-500/60 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:border-red-500"
								: expoState === "running"
									? "border-green-500/60 bg-green-500/10 text-green-500"
									: "border-border/60 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:border-border hover:text-foreground",
						)}
					>
						<ExpoIcon className="size-2.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent>{tooltipText}</TooltipContent>
			</Tooltip>
		</div>
	);
}
