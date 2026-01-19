import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiOutlineClipboard,
	HiOutlineDevicePhoneMobile,
	HiOutlineQrCode,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { create } from "zustand";

interface MobilePairingModalStore {
	isOpen: boolean;
	workspaceId: string | null;
	workspaceName: string | null;
	projectPath: string | null;
	openModal: (params: {
		workspaceId?: string;
		workspaceName?: string;
		projectPath?: string;
	}) => void;
	closeModal: () => void;
}

export const useMobilePairingModal = create<MobilePairingModalStore>((set) => ({
	isOpen: false,
	workspaceId: null,
	workspaceName: null,
	projectPath: null,
	openModal: ({ workspaceId, workspaceName, projectPath }) =>
		set({
			isOpen: true,
			workspaceId: workspaceId ?? null,
			workspaceName: workspaceName ?? null,
			projectPath: projectPath ?? null,
		}),
	closeModal: () =>
		set({
			isOpen: false,
			workspaceId: null,
			workspaceName: null,
			projectPath: null,
		}),
}));

export function MobilePairingModal() {
	const { isOpen, workspaceId, workspaceName, projectPath, closeModal } =
		useMobilePairingModal();

	const [qrData, setQrData] = useState<string | null>(null);
	const [pairingToken, setPairingToken] = useState<string | null>(null);
	const [expiresAt, setExpiresAt] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const generateQRMutation = electronTrpc.mobile.generatePairingQR.useMutation({
		onSuccess: (data) => {
			if (data.success) {
				setQrData(data.qrData ?? null);
				setPairingToken(data.pairingToken ?? null);
				setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
				setError(null);
			} else {
				setError(data.error ?? "Failed to generate QR code");
			}
			setIsLoading(false);
		},
		onError: (err) => {
			setError(err.message);
			setIsLoading(false);
		},
	});

	// Use ref to store the mutate function to avoid dependency issues
	const mutateRef = useRef(generateQRMutation.mutate);
	mutateRef.current = generateQRMutation.mutate;

	const generateQR = useCallback(() => {
		setIsLoading(true);
		setError(null);
		mutateRef.current({
			workspaceId: workspaceId ?? undefined,
			workspaceName: workspaceName ?? undefined,
			projectPath: projectPath ?? undefined,
		});
	}, [workspaceId, workspaceName, projectPath]);

	// Generate QR code when modal opens
	useEffect(() => {
		if (isOpen) {
			generateQR();
		} else {
			setQrData(null);
			setPairingToken(null);
			setExpiresAt(null);
			setError(null);
		}
		// Only run when isOpen changes, not when generateQR changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	// Auto-refresh QR code before expiry
	useEffect(() => {
		if (!expiresAt || !isOpen) return;

		const refreshTime = expiresAt.getTime() - Date.now() - 30000; // 30 seconds before expiry
		if (refreshTime <= 0) {
			generateQR();
			return;
		}

		const timeout = setTimeout(generateQR, refreshTime);
		return () => clearTimeout(timeout);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [expiresAt, isOpen]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HiOutlineDevicePhoneMobile className="h-5 w-5" />
						Connect Mobile
					</DialogTitle>
					<DialogDescription>
						Scan this QR code with your phone to connect Superset Mobile and use
						voice commands.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col items-center gap-4 py-4">
					{isLoading ? (
						<div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white">
							<div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
						</div>
					) : error ? (
						<div className="flex h-64 w-64 flex-col items-center justify-center gap-4 rounded-xl bg-red-50 p-4 text-center">
							<p className="text-sm text-red-600">{error}</p>
							<Button variant="outline" size="sm" onClick={generateQR}>
								Retry
							</Button>
						</div>
					) : qrData ? (
						<div className="flex flex-col items-center gap-4">
							{/* QR Code display */}
							<div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white p-4">
								<QRCodeDisplay data={qrData} />
							</div>

							{/* Pairing token for manual entry */}
							{pairingToken && (
								<div className="flex flex-col items-center gap-1">
									<p className="text-xs text-muted-foreground">
										Or enter this code manually:
									</p>
									<div className="flex items-center gap-2">
										<code className="rounded bg-muted px-2 py-1 font-mono text-xs">
											{pairingToken}
										</code>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={() => {
												navigator.clipboard.writeText(pairingToken);
											}}
										>
											<HiOutlineClipboard className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
							)}

							{/* Expiry countdown */}
							{expiresAt && <ExpiryCountdown expiresAt={expiresAt} />}
						</div>
					) : (
						<div className="flex h-64 w-64 items-center justify-center rounded-xl bg-muted">
							<HiOutlineQrCode className="h-16 w-16 text-muted-foreground" />
						</div>
					)}
				</div>

				<div className="flex flex-col gap-2 border-t pt-4">
					<p className="text-center text-xs text-muted-foreground">
						Open{" "}
						<span className="font-medium">app.superset.sh/mobile</span> on
						your phone and tap "Scan QR Code"
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/**
 * QR code display component using the qrcode library
 */
function QRCodeDisplay({ data }: { data: string }) {
	const [svgString, setSvgString] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		QRCode.toString(data, {
			type: "svg",
			width: 200,
			margin: 1,
			color: {
				dark: "#000000",
				light: "#ffffff",
			},
		})
			.then((svg) => {
				setSvgString(svg);
				setError(null);
			})
			.catch((err) => {
				console.error("[mobile] QR code generation failed:", err);
				setError("Failed to generate QR code");
			});
	}, [data]);

	if (error) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				<HiOutlineQrCode className="h-24 w-24 text-red-400" />
				<p className="text-xs text-red-500">{error}</p>
			</div>
		);
	}

	if (!svgString) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
			</div>
		);
	}

	return (
		<div
			className="h-full w-full"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: QR code SVG from trusted source
			dangerouslySetInnerHTML={{ __html: svgString }}
		/>
	);
}

function ExpiryCountdown({ expiresAt }: { expiresAt: Date }) {
	const [timeLeft, setTimeLeft] = useState(() =>
		Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
	);

	useEffect(() => {
		const interval = setInterval(() => {
			const remaining = Math.max(
				0,
				Math.floor((expiresAt.getTime() - Date.now()) / 1000),
			);
			setTimeLeft(remaining);
		}, 1000);

		return () => clearInterval(interval);
	}, [expiresAt]);

	const minutes = Math.floor(timeLeft / 60);
	const seconds = timeLeft % 60;

	return (
		<p className="text-xs text-muted-foreground">
			Expires in {minutes}:{seconds.toString().padStart(2, "0")}
		</p>
	);
}
