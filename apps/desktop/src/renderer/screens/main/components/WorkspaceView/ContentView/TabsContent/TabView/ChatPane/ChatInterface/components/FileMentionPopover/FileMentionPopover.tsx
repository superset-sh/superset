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
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useEffect, useRef, useState } from "react";
import { HiMiniAtSymbol } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

function isAtTrigger(value: string, prevValue: string): boolean {
	if (value.length !== prevValue.length + 1) return false;
	if (!value.endsWith("@")) return false;
	const charBeforeAt = value[value.length - 2];
	return (
		charBeforeAt === undefined || charBeforeAt === " " || charBeforeAt === "\n"
	);
}

export function FileMentionPopover({ cwd }: { cwd: string }) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const { textInput } = usePromptInputController();
	const prevValueRef = useRef(textInput.value);

	useEffect(() => {
		const prev = prevValueRef.current;
		prevValueRef.current = textInput.value;
		if (isAtTrigger(textInput.value, prev)) {
			setOpen(true);
		}
	}, [textInput.value]);

	const { data: results } = electronTrpc.filesystem.searchFiles.useQuery(
		{ rootPath: cwd, query: searchQuery, includeHidden: false, limit: 20 },
		{ enabled: open && searchQuery.length > 0 },
	);

	const handleSelect = (relativePath: string) => {
		const current = textInput.value;
		const trimmed = current.endsWith("@") ? current.slice(0, -1) : current;
		const separator = trimmed.length > 0 && !trimmed.endsWith(" ") ? " " : "";
		textInput.setInput(`${trimmed}${separator}@${relativePath} `);
		setSearchQuery("");
		setOpen(false);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearchQuery("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<PromptInputButton onClick={() => setOpen((v) => !v)}>
					<HiMiniAtSymbol className="size-4" />
				</PromptInputButton>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="start"
				className="w-80 p-0"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search files..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList>
						<CommandEmpty>
							{searchQuery.length === 0
								? "Type to search files..."
								: "No files found."}
						</CommandEmpty>
						{results && results.length > 0 && (
							<CommandGroup>
								{results.map((file) => (
									<CommandItem
										key={file.id}
										value={file.relativePath}
										onSelect={() => handleSelect(file.relativePath)}
									>
										<div className="flex flex-col gap-0.5 overflow-hidden">
											<span className="truncate text-sm font-medium">
												{file.name}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{file.relativePath}
											</span>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
