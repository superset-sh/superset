"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	createSpeechRecognizer,
	isSpeechRecognitionSupported,
	type SpeechRecognizer,
} from "@/lib/voice";

type ScanState = "idle" | "processing" | "validating" | "success" | "error";
type CommandTarget = "terminal" | "claude" | "task";

interface PairingResult {
	sessionId: string;
	workspaceName: string;
}

export default function ScanPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [scanState, setScanState] = useState<ScanState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [pairingResult, setPairingResult] = useState<PairingResult | null>(null);

	const processQRCode = useCallback(async (pairingToken: string) => {
		setScanState("validating");

		try {
			const response = await fetch("/api/mobile-pair", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pairingToken }),
			});

			const data = await response.json();

			if (!response.ok) {
				setScanState("error");
				setError(data.error || "Failed to validate pairing token");
				return;
			}

			setScanState("success");
			setPairingResult({
				sessionId: data.sessionId,
				workspaceName: data.workspaceName ?? "your workspace",
			});
		} catch (err) {
			console.error("[scan] Validation error:", err);
			setScanState("error");
			setError("Network error. Please try again.");
		}
	}, []);

	const handleImageSelect = useCallback(
		async (file: File) => {
			setScanState("processing");
			setError(null);

			try {
				const html5QrCode = new Html5Qrcode("qr-reader-hidden");
				const result = await html5QrCode.scanFile(file, true);

				// Parse the QR code data
				let pairingToken: string | null = null;

				try {
					const url = new URL(result);
					if (
						(url.protocol === "superset:" || url.protocol === "superset-dev:") &&
						url.host === "pair"
					) {
						pairingToken = url.searchParams.get("token");
					}
				} catch {
					// Check if it's a raw UUID token
					if (
						/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
							result,
						)
					) {
						pairingToken = result;
					}
				}

				if (pairingToken) {
					processQRCode(pairingToken);
				} else {
					setScanState("error");
					setError("No valid QR code found in image");
				}
			} catch (err) {
				console.error("[scan] QR decode error:", err);
				setScanState("error");
				setError("Could not read QR code from image. Try again with a clearer photo.");
			}
		},
		[processQRCode],
	);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			handleImageSelect(file);
		}
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file && file.type.startsWith("image/")) {
			handleImageSelect(file);
		}
	};

	const reset = () => {
		setScanState("idle");
		setError(null);
		setPairingResult(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="mb-2 text-2xl font-medium text-white">
					{scanState === "success" ? "Connected" : "Scan QR Code"}
				</h1>
				<p className="text-sm text-white/50">
					{scanState === "success"
						? `Paired to ${pairingResult?.workspaceName}`
						: "Take a photo of the QR code on your desktop or upload an image."}
				</p>
			</div>

			{/* Hidden element for html5-qrcode */}
			<div id="qr-reader-hidden" className="hidden" />

			{scanState === "idle" && (
				<div
					className="flex flex-col gap-4"
					onDragOver={(e) => e.preventDefault()}
					onDrop={handleDrop}
				>
					{/* Camera capture button - primary action on mobile */}
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-8 transition-colors active:bg-white/10"
					>
						<CameraIcon className="h-12 w-12 text-white/50" />
						<span className="text-lg font-medium text-white">
							Take Photo of QR Code
						</span>
						<span className="text-sm text-white/40">
							or tap to choose from gallery
						</span>
					</button>

					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						capture="environment"
						onChange={handleFileChange}
						className="hidden"
					/>

					{/* Drop zone hint for desktop */}
					<p className="text-center text-xs text-white/30">
						You can also drag and drop an image here
					</p>
				</div>
			)}

			{scanState === "processing" && (
				<div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/5 p-12">
					<div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
					<span className="text-white/70">Reading QR code...</span>
				</div>
			)}

			{scanState === "validating" && (
				<div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/5 p-12">
					<div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
					<span className="text-white/70">Connecting...</span>
				</div>
			)}

			{scanState === "success" && pairingResult && (
				<CommandInterface
					sessionId={pairingResult.sessionId}
					workspaceName={pairingResult.workspaceName}
					onDisconnect={reset}
				/>
			)}

			{scanState === "error" && (
				<div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-red-500/10 p-12 text-center">
					<XIcon className="h-16 w-16 text-red-500" />
					<span className="text-lg font-medium text-white">
						{error || "Something went wrong"}
					</span>
					<button
						onClick={reset}
						className="mt-2 rounded-lg bg-white px-6 py-2 text-sm font-medium text-black"
					>
						Try Again
					</button>
				</div>
			)}

			{/* Manual entry fallback */}
			{scanState === "idle" && (
				<ManualTokenEntry
					onSubmit={processQRCode}
					disabled={scanState !== "idle"}
				/>
			)}
		</div>
	);
}

interface CommandMessage {
	id: string;
	transcript: string;
	targetType: string;
	status: string;
	response: string | null;
	errorMessage: string | null;
	createdAt: string;
	executedAt: string | null;
}

function CommandInterface({
	sessionId,
	workspaceName,
	onDisconnect,
}: {
	sessionId: string;
	workspaceName: string;
	onDisconnect: () => void;
}) {
	const [target, setTarget] = useState<CommandTarget>("claude");
	const [textInput, setTextInput] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);
	const [messages, setMessages] = useState<CommandMessage[]>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Poll for command history
	useEffect(() => {
		const fetchHistory = async () => {
			try {
				const response = await fetch(
					`/api/mobile/commands?sessionId=${sessionId}&history=true`,
				);
				if (response.ok) {
					const data = await response.json();
					// Reverse to show oldest first
					setMessages((data.commands || []).reverse());
				}
			} catch (err) {
				console.error("[command] Failed to fetch history:", err);
			}
		};

		fetchHistory();
		const interval = setInterval(fetchHistory, 2000);
		return () => clearInterval(interval);
	}, [sessionId]);

	// Auto-scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const sendCommand = useCallback(
		async (transcript: string) => {
			if (!transcript.trim() || isSending) return;

			setIsSending(true);
			setSendError(null);

			try {
				const response = await fetch("/api/mobile/voice-command", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sessionId,
						transcript: transcript.trim(),
						targetType: target,
					}),
				});

				const data = await response.json();

				if (!response.ok) {
					setSendError(data.error || "Failed to send command");
					return;
				}

				setTextInput("");
			} catch (err) {
				console.error("[command] Send error:", err);
				setSendError("Network error. Please try again.");
			} finally {
				setIsSending(false);
			}
		},
		[sessionId, target, isSending],
	);

	const handleTextSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		sendCommand(textInput);
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center gap-3 rounded-xl bg-green-500/10 p-3">
				<CheckIcon className="h-5 w-5 text-green-500" />
				<div className="flex-1">
					<p className="text-sm font-medium text-white">Connected to {workspaceName}</p>
				</div>
				<button
					onClick={onDisconnect}
					className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20"
				>
					Disconnect
				</button>
			</div>

			{/* Conversation */}
			<div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto rounded-xl bg-white/5 p-4">
				{messages.length === 0 ? (
					<p className="text-center text-sm text-white/40">
						No messages yet. Send a command to get started!
					</p>
				) : (
					messages.map((msg) => (
						<div key={msg.id} className="flex flex-col gap-2">
							{/* User message */}
							<div className="flex justify-end">
								<div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-500 px-4 py-2">
									<p className="text-sm text-white">{msg.transcript}</p>
									<p className="mt-1 text-xs text-white/60">
										→ {msg.targetType === "claude" ? "Claude" : msg.targetType === "terminal" ? "Terminal" : "Task"}
									</p>
								</div>
							</div>

							{/* Response */}
							{msg.status === "pending" ? (
								<div className="flex justify-start">
									<div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2">
										<div className="flex items-center gap-2">
											<div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
											<p className="text-sm text-white/50">Waiting for response...</p>
										</div>
									</div>
								</div>
							) : msg.status === "failed" ? (
								<div className="flex justify-start">
									<div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-red-500/20 px-4 py-2">
										<p className="text-sm text-red-400">
											Error: {msg.errorMessage || "Command failed"}
										</p>
									</div>
								</div>
							) : msg.response ? (
								<div className="flex justify-start">
									<div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2">
										<pre className="whitespace-pre-wrap break-all font-mono text-xs text-white/90">
											{msg.response}
										</pre>
									</div>
								</div>
							) : (
								<div className="flex justify-start">
									<div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2">
										<p className="text-sm text-white/50">Command executed</p>
									</div>
								</div>
							)}
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Target selector */}
			<div className="flex gap-2">
				{(["claude", "terminal", "task"] as const).map((t) => (
					<button
						key={t}
						onClick={() => setTarget(t)}
						className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
							target === t
								? "bg-white text-black"
								: "bg-white/10 text-white hover:bg-white/20"
						}`}
					>
						{t === "claude" ? "Claude" : t === "terminal" ? "Terminal" : "Task"}
					</button>
				))}
			</div>

			{/* Voice button */}
			<VoiceInput
				onTranscript={sendCommand}
				target={target}
				disabled={isSending}
			/>

			{/* Text input */}
			<form onSubmit={handleTextSubmit} className="flex gap-2">
				<input
					type="text"
					value={textInput}
					onChange={(e) => setTextInput(e.target.value)}
					placeholder={`Message to ${target === "claude" ? "Claude" : target === "terminal" ? "Terminal" : "create task"}...`}
					disabled={isSending}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
				/>
				<button
					type="submit"
					disabled={isSending || !textInput.trim()}
					className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-50"
				>
					{isSending ? "..." : "Send"}
				</button>
			</form>

			{/* Error feedback */}
			{sendError && (
				<div className="rounded-lg bg-red-500/10 p-3 text-center">
					<p className="text-sm text-red-400">{sendError}</p>
				</div>
			)}
		</div>
	);
}

function VoiceInput({
	onTranscript,
	target,
	disabled,
}: {
	onTranscript: (transcript: string) => void;
	target: CommandTarget;
	disabled?: boolean;
}) {
	const [isListening, setIsListening] = useState(false);
	const [transcript, setTranscript] = useState("");
	const [interimTranscript, setInterimTranscript] = useState("");
	const [isSupported, setIsSupported] = useState(true);

	const recognizerRef = useRef<SpeechRecognizer | null>(null);
	const finalTranscriptRef = useRef("");

	useEffect(() => {
		setIsSupported(isSpeechRecognitionSupported());
	}, []);

	const startListening = useCallback(() => {
		if (disabled || !isSupported) return;

		finalTranscriptRef.current = "";
		setTranscript("");
		setInterimTranscript("");

		const recognizer = createSpeechRecognizer(
			{
				continuous: true,
				interimResults: true,
				language: "en-US",
			},
			{
				onStart: () => {
					setIsListening(true);
				},
				onEnd: () => {
					setIsListening(false);
					// Submit the final transcript
					if (finalTranscriptRef.current.trim()) {
						onTranscript(finalTranscriptRef.current.trim());
						setTranscript("");
						setInterimTranscript("");
					}
				},
				onResult: ({ transcript: text, isFinal }) => {
					if (isFinal) {
						finalTranscriptRef.current += text + " ";
						setTranscript(finalTranscriptRef.current);
						setInterimTranscript("");
					} else {
						setInterimTranscript(text);
					}
				},
				onError: (error) => {
					console.error("[voice] Recognition error:", error);
					setIsListening(false);
				},
			},
		);

		recognizerRef.current = recognizer;
		recognizer.start();
	}, [disabled, isSupported, onTranscript]);

	const stopListening = useCallback(() => {
		if (recognizerRef.current) {
			recognizerRef.current.stop();
			recognizerRef.current = null;
		}
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			startListening();
		},
		[startListening],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			stopListening();
		},
		[stopListening],
	);

	const handlePointerLeave = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			if (isListening) {
				stopListening();
			}
		},
		[isListening, stopListening],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (recognizerRef.current) {
				recognizerRef.current.abort();
			}
		};
	}, []);

	if (!isSupported) {
		return (
			<div className="text-center text-sm text-white/50">
				Voice input is not supported in this browser. Use the text input below.
			</div>
		);
	}

	const displayTranscript = transcript + interimTranscript;

	return (
		<div className="flex flex-col items-center gap-4">
			{/* Transcript display */}
			{displayTranscript && (
				<div className="w-full rounded-lg bg-white/5 p-3">
					<p className="text-sm text-white">
						{transcript}
						<span className="text-white/50">{interimTranscript}</span>
					</p>
				</div>
			)}

			{/* Voice button */}
			<button
				type="button"
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerLeave={handlePointerLeave}
				onPointerCancel={handlePointerLeave}
				disabled={disabled}
				className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all touch-none select-none ${
					isListening
						? "bg-red-500 scale-110"
						: "bg-white/10 hover:bg-white/20 active:scale-95"
				} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
			>
				<MicrophoneIcon
					className={`h-8 w-8 transition-colors ${
						isListening ? "text-white" : "text-white/70"
					}`}
				/>

				{/* Pulse animation when listening */}
				{isListening && (
					<>
						<span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />
						<span className="absolute inset-0 animate-pulse rounded-full bg-red-500 opacity-20" />
					</>
				)}
			</button>

			{/* Instructions */}
			<p className="text-center text-sm text-white/50">
				{isListening
					? "Release to send"
					: `Hold to speak to ${target === "terminal" ? "Terminal" : target === "claude" ? "Claude" : "create a Task"}`}
			</p>
		</div>
	);
}

function ManualTokenEntry({
	onSubmit,
	disabled,
}: {
	onSubmit: (token: string) => void;
	disabled: boolean;
}) {
	const [token, setToken] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (token.trim()) {
			onSubmit(token.trim());
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<label className="text-sm text-white/70">
				Or enter pairing code manually:
			</label>
			<div className="flex gap-2">
				<input
					type="text"
					value={token}
					onChange={(e) => setToken(e.target.value)}
					placeholder="Paste pairing token"
					disabled={disabled}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
				/>
				<button
					type="submit"
					disabled={disabled || !token.trim()}
					className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-50"
				>
					Connect
				</button>
			</div>
		</form>
	);
}

function CameraIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
			<circle cx="12" cy="13" r="3" />
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
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
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
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
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

function MicrophoneIcon({ className }: { className?: string }) {
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
			<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<line x1="12" x2="12" y1="19" y2="22" />
		</svg>
	);
}
