import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuCopy,
	LuTriangleAlert,
} from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import stripAnsi from "strip-ansi";
import { GhAuthTerminal } from "./GhAuthTerminal";

const GH_AUTH_COMMAND =
	"gh auth login --hostname github.com --git-protocol https --web";
const GH_INSTALL_COMMAND = `brew install gh && ${GH_AUTH_COMMAND}`;

const ONE_TIME_CODE_PATTERN = /one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})/;

export type GhAuthDialogMode = "auth" | "install";

type Phase = "running" | "checking" | "success" | "failed";

interface GhAuthDialogProps {
	open: boolean;
	mode: GhAuthDialogMode;
	onOpenChange: (open: boolean) => void;
	/** Fired when the gh process exits so the caller can re-check auth status. */
	onExit: () => void;
}

export function GhAuthDialog({
	open,
	mode,
	onOpenChange,
	onExit,
}: GhAuthDialogProps) {
	const [phase, setPhase] = useState<Phase>("running");
	const [attempt, setAttempt] = useState(0);
	const [oneTimeCode, setOneTimeCode] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const outputBufferRef = useRef("");
	const closeTimerRef = useRef<number | null>(null);
	const terminalBoxRef = useRef<HTMLDivElement>(null);
	const ptyWriteRef = useRef<((data: string) => void) | null>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		if (!open) return;
		setPhase("running");
		setAttempt(0);
		setOneTimeCode(null);
		setCopied(false);
		outputBufferRef.current = "";
		return () => {
			if (closeTimerRef.current !== null) {
				window.clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		};
	}, [open]);

	// Auto-copy so the happy path needs no clicks; the Copy button remains as
	// a fallback for when the clipboard write is rejected (e.g. window unfocused).
	useEffect(() => {
		if (!oneTimeCode) return;
		navigator.clipboard.writeText(oneTimeCode).then(
			() => setCopied(true),
			() => setCopied(false),
		);
	}, [oneTimeCode]);

	const handleOutput = (data: string) => {
		if (oneTimeCode) return;
		outputBufferRef.current = (outputBufferRef.current + data).slice(-4096);
		const match = stripAnsi(outputBufferRef.current).match(
			ONE_TIME_CODE_PATTERN,
		);
		if (match?.[1]) {
			setOneTimeCode(match[1]);
			// gh only waits for Enter so the user can copy the code first —
			// we've captured it, so advance straight to opening the browser.
			ptyWriteRef.current?.("\r");
		}
	};

	const handleTerminalExit = () => {
		setPhase("checking");
		onExitRef.current();
		void electronTrpcClient.system.detectGhCli
			.query()
			.then((status) => {
				if (status.installed && status.authenticated) {
					setPhase("success");
					closeTimerRef.current = window.setTimeout(() => {
						onOpenChange(false);
					}, 1500);
				} else {
					setPhase("failed");
				}
			})
			.catch(() => setPhase("failed"));
	};

	const handleRetry = () => {
		setPhase("running");
		setOneTimeCode(null);
		setCopied(false);
		outputBufferRef.current = "";
		setAttempt((prev) => prev + 1);
	};

	const focusTerminal = () => {
		terminalBoxRef.current
			?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
			?.focus();
	};

	const handleCopyCode = () => {
		if (!oneTimeCode) return;
		navigator.clipboard.writeText(oneTimeCode).then(
			() => setCopied(true),
			() => {},
		);
		// Return focus to the terminal so Enter goes to gh, not the button.
		focusTerminal();
	};

	const processActive = phase === "running" || phase === "checking";
	const isInstall = mode === "install";

	return (
		<Dialog open={open} modal onOpenChange={onOpenChange}>
			<DialogContent
				className="gap-3 sm:max-w-[752px]"
				aria-describedby={undefined}
				onInteractOutside={(event) => {
					if (processActive) event.preventDefault();
				}}
				onFocusOutside={(event) => {
					if (processActive) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{isInstall ? "Install GitHub CLI" : "Sign in to GitHub CLI"}
					</DialogTitle>
				</DialogHeader>
				{phase === "success" ? (
					<div className="flex h-[296px] w-full flex-col items-center justify-center gap-2.5 rounded-lg border bg-[#151110]">
						<LuCheck className="size-5 text-emerald-500" strokeWidth={2} />
						<p className="text-sm font-medium text-foreground">
							{isInstall
								? "GitHub CLI installed and signed in"
								: "Signed in to GitHub"}
						</p>
					</div>
				) : (
					<>
						{phase === "failed" ? (
							<div className="flex min-h-11 items-center gap-2.5 rounded-md border bg-muted/40 px-3.5 py-1.5 text-sm text-foreground">
								<LuTriangleAlert className="size-3.5 shrink-0 text-destructive" />
								<span className="select-text cursor-text">
									{isInstall
										? "Installation didn't complete"
										: "Sign-in didn't complete"}
								</span>
								<span className="ml-auto flex shrink-0 items-center gap-2">
									{isInstall && (
										<Button
											type="button"
											size="sm"
											variant="ghost"
											onClick={() =>
												window.open(
													"https://cli.github.com/",
													"_blank",
													"noopener,noreferrer",
												)
											}
										>
											Install manually
											<LuArrowUpRight className="size-3" />
										</Button>
									)}
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={handleRetry}
									>
										Retry
									</Button>
								</span>
							</div>
						) : phase === "checking" ? (
							<div className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/40 px-3.5 text-sm text-muted-foreground">
								<Spinner className="size-3.5 shrink-0" />
								Checking sign-in status…
							</div>
						) : oneTimeCode ? (
							<div className="flex min-h-11 items-center gap-3 rounded-md border bg-muted/40 px-3.5 py-1.5">
								<span className="select-text cursor-text font-mono text-lg font-semibold tracking-[0.18em] text-foreground">
									{oneTimeCode}
								</span>
								<span className="text-xs text-muted-foreground">
									Paste this code on GitHub — your browser is opening
								</span>
								{copied ? (
									<span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-500">
										<LuCheck className="size-3.5" strokeWidth={2.5} />
										Copied
									</span>
								) : (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="ml-auto"
										onClick={handleCopyCode}
									>
										<LuCopy className="size-3.5" />
										Copy
									</Button>
								)}
							</div>
						) : (
							<div className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted/40 px-3.5 text-sm text-muted-foreground">
								<Spinner className="size-3.5 shrink-0" />
								Follow the prompts below
							</div>
						)}
						<div
							ref={terminalBoxRef}
							className={cn(
								"h-[240px] w-full overflow-hidden rounded-lg border bg-[#151110] p-3 transition-opacity duration-300",
								phase === "failed" && "opacity-60",
							)}
						>
							{open && (
								<GhAuthTerminal
									key={attempt}
									command={isInstall ? GH_INSTALL_COMMAND : GH_AUTH_COMMAND}
									onExit={handleTerminalExit}
									onOutput={handleOutput}
									onWriterReady={(write) => {
										ptyWriteRef.current = write;
									}}
								/>
							)}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
