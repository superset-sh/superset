"use client";

import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useTRPC } from "@/trpc/react";
import { VoiceButton, type VoiceTarget } from "../../components/VoiceButton";

interface PairingSession {
	id: string;
	workspaceId: string | null;
	workspaceName: string | null;
	projectPath: string | null;
	desktopInstanceId: string;
	pairedAt: Date | null;
}

export default function WorkspaceDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [selectedTarget, setSelectedTarget] = useState<VoiceTarget>("terminal");
	const [commandHistory, setCommandHistory] = useState<
		Array<{ transcript: string; target: VoiceTarget; status: string }>
	>([]);

	const { data: sessions } = useQuery(
		trpc.mobile.getActiveSessions.queryOptions(),
	);
	const session = sessions?.find((s: PairingSession) => s.id === params.id);

	const sendCommandMutation = useMutation(
		trpc.mobile.sendVoiceCommand.mutationOptions({
			onSuccess: (data) => {
				setCommandHistory((prev) =>
					prev.map((cmd, i) =>
						i === prev.length - 1 ? { ...cmd, status: data.status } : cmd,
					),
				);
			},
			onError: () => {
				setCommandHistory((prev) =>
					prev.map((cmd, i) =>
						i === prev.length - 1 ? { ...cmd, status: "failed" } : cmd,
					),
				);
			},
		}),
	);

	const revokeSessionMutation = useMutation(
		trpc.mobile.revokeSession.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.mobile.getActiveSessions.queryKey(),
				});
				router.push("/mobile");
			},
		}),
	);

	const handleTranscript = useCallback(
		(transcript: string, target: VoiceTarget) => {
			// Add to local history immediately
			setCommandHistory((prev) => [
				...prev,
				{ transcript, target, status: "pending" },
			]);

			// Send to server
			sendCommandMutation.mutate({
				sessionId: params.id,
				transcript,
				targetType: target,
			});
		},
		[params.id, sendCommandMutation],
	);

	const handleDisconnect = useCallback(() => {
		if (confirm("Are you sure you want to disconnect this workspace?")) {
			revokeSessionMutation.mutate({ sessionId: params.id });
		}
	}, [params.id, revokeSessionMutation]);

	if (!session) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-white/50">Workspace not found or disconnected.</p>
				<button
					onClick={() => router.push("/mobile")}
					className="mt-4 text-sm text-blue-400 hover:underline"
				>
					Go back
				</button>
			</div>
		);
	}

	const workspaceName = session.workspaceName ?? "Unnamed Workspace";
	const projectName = session.projectPath?.split("/").pop() ?? "Unknown project";

	return (
		<div className="flex flex-col gap-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-medium text-white">{workspaceName}</h1>
					<p className="text-sm text-white/50">{projectName}</p>
				</div>
				<button
					onClick={handleDisconnect}
					className="rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
				>
					Disconnect
				</button>
			</div>

			{/* Connection status */}
			<div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2">
				<span className="flex h-2 w-2 rounded-full bg-green-500" />
				<span className="text-sm text-green-400">Connected</span>
			</div>

			{/* Target selector */}
			<div className="flex flex-col gap-2">
				<label className="text-sm text-white/70">Send voice to:</label>
				<div className="flex gap-2">
					{(["terminal", "claude", "task"] as const).map((target) => (
						<button
							key={target}
							type="button"
							onClick={() => setSelectedTarget(target)}
							className={cn(
								"flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
								selectedTarget === target
									? "border-white bg-white text-black"
									: "border-white/20 bg-white/5 text-white hover:bg-white/10",
							)}
						>
							{target === "terminal" && "Terminal"}
							{target === "claude" && "Claude"}
							{target === "task" && "Task"}
						</button>
					))}
				</div>
			</div>

			{/* Voice button */}
			<div className="flex flex-col items-center py-8">
				<VoiceButton
					target={selectedTarget}
					onTranscript={handleTranscript}
					disabled={sendCommandMutation.isPending}
				/>
			</div>

			{/* Command history */}
			{commandHistory.length > 0 && (
				<div className="flex flex-col gap-2">
					<h2 className="text-sm font-medium text-white/70">Recent Commands</h2>
					<div className="flex flex-col gap-2">
						{[...commandHistory].reverse().map((cmd, i) => (
							<div
								key={i}
								className="flex items-start gap-3 rounded-lg bg-white/5 p-3"
							>
								<TargetIcon target={cmd.target} className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
								<div className="flex-1">
									<p className="text-sm text-white">{cmd.transcript}</p>
									<p
										className={cn(
											"mt-1 text-xs",
											cmd.status === "pending" && "text-yellow-400",
											cmd.status === "sent" && "text-blue-400",
											cmd.status === "executed" && "text-green-400",
											cmd.status === "failed" && "text-red-400",
										)}
									>
										{cmd.status === "pending" && "Sending..."}
										{cmd.status === "sent" && "Sent"}
										{cmd.status === "executed" && "Executed"}
										{cmd.status === "failed" && "Failed"}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function TargetIcon({
	target,
	className,
}: {
	target: VoiceTarget;
	className?: string;
}) {
	if (target === "terminal") {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={className}
			>
				<polyline points="4 17 10 11 4 5" />
				<line x1="12" x2="20" y1="19" y2="19" />
			</svg>
		);
	}

	if (target === "claude") {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={className}
			>
				<path d="M12 8V4H8" />
				<rect width="16" height="12" x="4" y="8" rx="2" />
				<path d="M2 14h2" />
				<path d="M20 14h2" />
				<path d="M15 13v2" />
				<path d="M9 13v2" />
			</svg>
		);
	}

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M12 2v4" />
			<path d="m16.2 7.8 2.9-2.9" />
			<path d="M18 12h4" />
			<path d="m16.2 16.2 2.9 2.9" />
			<path d="M12 18v4" />
			<path d="m4.9 19.1 2.9-2.9" />
			<path d="M2 12h4" />
			<path d="m4.9 4.9 2.9 2.9" />
		</svg>
	);
}
