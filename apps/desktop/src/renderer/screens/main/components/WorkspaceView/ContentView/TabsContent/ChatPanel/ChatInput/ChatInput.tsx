import { LuAtSign, LuGlobe, LuImage, LuInfinity } from "react-icons/lu";
import { RiStopFill } from "react-icons/ri";
import { VscArrowUp, VscChevronDown } from "react-icons/vsc";

interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder: string;
	isLoading?: boolean;
}

export function ChatInput({
	value,
	onChange,
	onSubmit,
	placeholder,
	isLoading,
}: ChatInputProps) {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && value.trim().length > 0) {
			e.preventDefault();
			onSubmit();
		}
	};

	return (
		<div className="m-2 p-3 bg-accent rounded-md border border-accent-foreground/20">
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				rows={2}
				className="w-full bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground"
			/>
			<div className="flex items-center justify-between mt-2">
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
					>
						<LuInfinity className="size-4" />
						<VscChevronDown className="size-3" />
					</button>
					<button
						type="button"
						className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
					>
						<span className="text-sm">Auto</span>
						<VscChevronDown className="size-3" />
					</button>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
					>
						<LuAtSign className="size-4" />
					</button>
					<button
						type="button"
						className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
					>
						<LuGlobe className="size-4" />
					</button>
					<button
						type="button"
						className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
					>
						<LuImage className="size-4" />
					</button>
					{isLoading ? (
						<button
							type="button"
							className="group relative size-5 rounded-full bg-accent-foreground/80 flex items-center justify-center hover:bg-muted transition-colors shrink-0"
						>
							<RiStopFill className="size-3 transition-opacity" color="#000" />
						</button>
					) : (
						<button
							type="button"
							onClick={onSubmit}
							disabled={!value.trim()}
							className="p-1.5 rounded-full bg-muted-foreground/20 text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:text-foreground transition-colors"
						>
							<VscArrowUp className="size-4" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
