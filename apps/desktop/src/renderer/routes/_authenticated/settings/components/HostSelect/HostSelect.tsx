import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineComputerDesktop, HiOutlineServer } from "react-icons/hi2";

export interface HostSelectOption {
	id: string;
	name: string;
	isLocal: boolean;
	isOnline: boolean;
}

interface HostSelectProps {
	value: string;
	options: HostSelectOption[];
	onValueChange: (id: string) => void;
	align?: "start" | "end";
	className?: string;
}

export function HostSelect({
	value,
	options,
	onValueChange,
	align = "end",
	className,
}: HostSelectProps) {
	const selected = options.find((option) => option.id === value);

	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				size="sm"
				className={`h-8 gap-1.5 px-2 text-foreground ${className ?? ""}`}
			>
				<SelectValue>
					<span className="flex items-center gap-1.5">
						<span className="truncate">
							{selected?.isLocal ? "This device" : (selected?.name ?? value)}
						</span>
						{selected && !selected.isLocal && (
							<span
								title={selected.isOnline ? "Online" : "Offline"}
								className={
									selected.isOnline
										? "size-1.5 shrink-0 rounded-full bg-emerald-500"
										: "size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
								}
							/>
						)}
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent align={align}>
				{options.map((option) => (
					<SelectItem key={option.id} value={option.id}>
						<span className="flex items-center gap-2">
							{option.isLocal ? (
								<HiOutlineComputerDesktop className="size-4 text-muted-foreground" />
							) : (
								<HiOutlineServer className="size-4 text-muted-foreground" />
							)}
							<span className="truncate">
								{option.isLocal ? "This device" : option.name}
							</span>
							{!option.isLocal && !option.isOnline && (
								<span className="text-xs text-muted-foreground">offline</span>
							)}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
