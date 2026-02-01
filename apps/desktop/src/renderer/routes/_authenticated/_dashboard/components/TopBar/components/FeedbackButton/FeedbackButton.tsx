import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef, useState } from "react";
import { FaDiscord } from "react-icons/fa6";
import {
	LuBookOpen,
	LuCircleHelp,
	LuGithub,
	LuImagePlus,
	LuLoader,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	useAddFeedbackImage,
	useClearFeedbackForm,
	useCloseFeedbackModal,
	useFeedbackImages,
	useFeedbackMessage,
	useFeedbackModalOpen,
	useOpenFeedbackModal,
	useRemoveFeedbackImage,
	useSetFeedbackMessage,
} from "renderer/stores/feedback-modal";

export function FeedbackButton() {
	const isOpen = useFeedbackModalOpen();
	const openModal = useOpenFeedbackModal();
	const closeModal = useCloseFeedbackModal();
	const message = useFeedbackMessage();
	const images = useFeedbackImages();
	const setMessage = useSetFeedbackMessage();
	const addImage = useAddFeedbackImage();
	const removeImage = useRemoveFeedbackImage();
	const clearForm = useClearFeedbackForm();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;

		for (const file of files) {
			if (!file.type.startsWith("image/")) continue;

			const reader = new FileReader();
			reader.onload = (event) => {
				const dataUrl = event.target?.result as string;
				addImage({
					id: crypto.randomUUID(),
					dataUrl,
					name: file.name,
				});
			};
			reader.readAsDataURL(file);
		}

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleSend = async () => {
		if (!message.trim()) {
			toast.error("Please enter a message");
			return;
		}

		setIsSubmitting(true);
		try {
			await apiTrpcClient.feedback.create.mutate({
				message: message.trim(),
				images: images.map((img) => img.dataUrl),
			});

			toast.success("Feedback sent", {
				description: "Thank you for your feedback!",
			});
			clearForm();
			closeModal();
		} catch (error) {
			console.error("[feedback] Failed to submit:", error);
			toast.error("Failed to send feedback", {
				description: "Please try again later",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClear = () => {
		clearForm();
	};

	const hasContent = message.trim() || images.length > 0;

	return (
		<>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={openModal}
						className="no-drag flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<LuCircleHelp className="size-4" strokeWidth={1.5} />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Feedback</TooltipContent>
			</Tooltip>

			<Dialog
				modal
				open={isOpen}
				onOpenChange={(open) => !open && closeModal()}
			>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle>Send Feedback</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
						<Textarea
							placeholder="Tell us what's on your mind..."
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							className="min-h-[120px] resize-none"
							disabled={isSubmitting}
						/>

						{images.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{images.map((image) => (
									<div key={image.id} className="relative group">
										<img
											src={image.dataUrl}
											alt={image.name}
											className="h-16 w-16 object-cover rounded-md border border-border"
										/>
										<button
											type="button"
											onClick={() => removeImage(image.id)}
											disabled={isSubmitting}
											className="absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
										>
											<LuX className="size-3" />
										</button>
									</div>
								))}
							</div>
						)}

						<div className="flex items-center gap-2">
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								multiple
								onChange={handleFileSelect}
								className="hidden"
								disabled={isSubmitting}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => fileInputRef.current?.click()}
								disabled={isSubmitting}
								className="gap-1.5"
							>
								<LuImagePlus className="size-4" />
								Attach Image
							</Button>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
						<span>Looking for help? Try opening a</span>
						<a
							href="https://github.com/superset-sh/superset/issues"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground hover:bg-accent transition-colors"
						>
							<LuGithub className="size-3" />
							GitHub issue
						</a>
						<span>, our</span>
						<a
							href="https://docs.superset.sh"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground hover:bg-accent transition-colors"
						>
							<LuBookOpen className="size-3" />
							docs
						</a>
						<span>, or</span>
						<a
							href="https://discord.gg/cZeD9WYcV7"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground hover:bg-accent transition-colors"
						>
							<FaDiscord className="size-3" />
							Discord
						</a>
						<span>.</span>
					</div>

					<DialogFooter className="gap-2 sm:gap-0">
						{hasContent && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleClear}
								disabled={isSubmitting}
								className="gap-1.5 text-muted-foreground hover:text-destructive"
							>
								<LuTrash2 className="size-4" />
								Clear
							</Button>
						)}
						<Button
							type="button"
							size="sm"
							onClick={handleSend}
							disabled={isSubmitting || !message.trim()}
						>
							{isSubmitting ? (
								<>
									<LuLoader className="size-4 animate-spin" />
									Sending...
								</>
							) : (
								"Send Feedback"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
