import {
	PromptInputButton,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@superset/ui/popover";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { HiMiniAtSymbol } from "react-icons/hi2";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

function findAtTriggerIndex(value: string, prevValue: string): number {
	if (value.length !== prevValue.length + 1) return -1;
	for (let i = 0; i < value.length; i++) {
		if (value[i] !== prevValue[i]) {
			if (value[i] !== "@") return -1;
			const charBefore = value[i - 1];
			if (
				charBefore === undefined ||
				charBefore === " " ||
				charBefore === "\n"
			) {
				return i;
			}
			return -1;
		}
	}
	return -1;
}

function getDirectoryPath(relativePath: string): string {
	const lastSlash = relativePath.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return relativePath.slice(0, lastSlash);
}

interface MentionContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const MentionContext = createContext<MentionContextValue | null>(null);

export function MentionProvider({
	cwd,
	children,
}: {
	cwd: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [triggerIndex, setTriggerIndex] = useState(-1);
	const { textInput } = usePromptInputController();
	const prevValueRef = useRef(textInput.value);

	useEffect(() => {
		const prev = prevValueRef.current;
		prevValueRef.current = textInput.value;
		const idx = findAtTriggerIndex(textInput.value, prev);
		if (idx !== -1) {
			setTriggerIndex(idx);
			setSearchQuery("");
			setOpen(true);
		}
	}, [textInput.value]);
	const immediateSearchQuery = searchQuery.trim();
	const debouncedSearchQuery = useDebouncedValue(immediateSearchQuery, 120);
	const files: Array<{ id: string; name: string; relativePath: string }> = [];
	const isSearchPending =
		!!cwd &&
		immediateSearchQuery.length > 0 &&
		immediateSearchQuery !== debouncedSearchQuery;

	const handleSelectFile = (relativePath: string) => {
		const current = textInput.value;
		const before = current.slice(0, triggerIndex);
		const after = current.slice(triggerIndex + 1);
		textInput.setInput(`${before}@${relativePath} ${after}`);
		setTriggerIndex(-1);
		setOpen(false);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setSearchQuery("");
		setOpen(nextOpen);
	};

	return (
		<MentionContext.Provider value={{ open, setOpen }}>
			<Popover open={open} onOpenChange={handleOpenChange}>
				{children}
				<PopoverContent
					side="top"
					align="start"
					sideOffset={0}
					className="w-80 p-0 text-xs"
				>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search files..."
							value={searchQuery}
							onValueChange={setSearchQuery}
						/>
						<CommandList className="max-h-[200px] [&::-webkit-scrollbar]:hidden">
							{files.length === 0 && (
								<CommandEmpty className="px-2 py-3 text-left text-xs text-muted-foreground">
									{searchQuery.length === 0
										? "Type to search files..."
										: isSearchPending
											? "Searching files..."
											: "File search is not available yet."}
								</CommandEmpty>
							)}
							{files.length > 0 && (
								<CommandGroup heading="Files">
									{files.map((file) => {
										const dirPath = getDirectoryPath(file.relativePath);
										return (
											<CommandItem
												key={file.id}
												value={file.relativePath}
												onSelect={() => handleSelectFile(file.relativePath)}
											>
												<FileIcon
													fileName={file.name}
													className="size-3.5 shrink-0"
												/>
												<span className="truncate text-xs">{file.name}</span>
												{dirPath && (
													<span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
														{dirPath}
													</span>
												)}
											</CommandItem>
										);
									})}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</MentionContext.Provider>
	);
}

export function MentionAnchor({ children }: { children: ReactNode }) {
	return <PopoverAnchor asChild>{children}</PopoverAnchor>;
}

export function MentionTrigger() {
	const ctx = useContext(MentionContext);
	return (
		<PopoverTrigger asChild>
			<PromptInputButton onClick={() => ctx?.setOpen(!ctx.open)}>
				<HiMiniAtSymbol className="size-4" />
			</PromptInputButton>
		</PopoverTrigger>
	);
}
