import { Command, CommandInput } from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ArrowLeftIcon } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useCommandContext } from "../../core/ContextProvider";
import { executeCommand } from "../../core/execute";
import { useFrameStackStore } from "../../core/frames";
import type { Command as CommandType } from "../../core/types";
import { CommandListView } from "../CommandListView/CommandListView";
import { SubPaletteView } from "../SubPaletteView/SubPaletteView";

const QueryContext = createContext<string>("");
export function useCommandPaletteQuery(): string {
	return useContext(QueryContext);
}

export function CommandPalette() {
	const open = useFrameStackStore((s) => s.open);
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const frames = useFrameStackStore((s) => s.frames);
	const pushFrame = useFrameStackStore((s) => s.pushFrame);
	const popFrame = useFrameStackStore((s) => s.popFrame);
	const reset = useFrameStackStore((s) => s.reset);

	const context = useCommandContext();
	const [query, setQuery] = useState("");
	const depth = frames.length;
	const currentFrame = frames[depth - 1] ?? null;

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next) {
				setQuery("");
				reset();
			}
		},
		[setOpen, reset],
	);

	const handleSelect = useCallback(
		(command: CommandType) => {
			if (command.children || command.renderFrame) {
				pushFrame(command);
				setQuery("");
				return;
			}
			void executeCommand(command, context);
			handleOpenChange(false);
		},
		[pushFrame, context, handleOpenChange],
	);

	const handleBack = useCallback(() => {
		popFrame();
		setQuery("");
	}, [popFrame]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "Backspace" && !query && depth > 0) {
				event.preventDefault();
				handleBack();
			}
		},
		[query, depth, handleBack],
	);

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const placeholder = currentFrame
		? `Search in ${currentFrame.command.title}…`
		: "Type a command or search…";

	const backButton = (
		<button
			type="button"
			onClick={handleBack}
			aria-label="Back"
			className="text-muted-foreground hover:text-foreground"
		>
			<ArrowLeftIcon className="size-4 shrink-0" />
		</button>
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="!max-w-[720px] sm:!max-w-[720px] translate-y-0 max-h-[80vh] overflow-hidden p-0"
				style={{ top: "max(16px, calc(50% - 278px))" }}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Command Palette</DialogTitle>
					<DialogDescription>
						Run commands and navigate the application.
					</DialogDescription>
				</DialogHeader>
				<Command
					shouldFilter={!currentFrame || !currentFrame.command.renderFrame}
					className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 [&_[cmdk-list]]:max-h-[min(500px,calc(80vh-3rem))]"
				>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder={placeholder}
						onKeyDown={handleKeyDown}
						leading={depth > 0 ? backButton : undefined}
					/>
					<QueryContext.Provider value={query}>
						{currentFrame ? (
							<SubPaletteView
								parent={currentFrame.command}
								onSelect={handleSelect}
							/>
						) : (
							<CommandListView onSelect={handleSelect} />
						)}
					</QueryContext.Provider>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
