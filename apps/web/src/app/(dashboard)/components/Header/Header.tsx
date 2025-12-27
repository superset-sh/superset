"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function Header() {
	const { user } = useUser();

	const initials = getInitials(
		user?.fullName,
		user?.primaryEmailAddress?.emailAddress,
	);

	return (
		<header className="sticky left-0 top-0 z-40 w-full border-b border-border/50 bg-background py-4">
			<div className="mx-auto flex min-h-8 w-[95vw] max-w-screen-2xl items-center justify-between">
				<Link href="/" aria-label="Go to home">
					<Image
						src="/title.svg"
						alt="Superset"
						width={150}
						height={25}
						priority
					/>
				</Link>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Avatar className="size-8">
								<AvatarImage src={user?.imageUrl} alt={user?.fullName ?? ""} />
								<AvatarFallback className="text-xs">{initials}</AvatarFallback>
							</Avatar>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<SignOutButton>
							<DropdownMenuItem className="cursor-pointer">
								<LogOut className="mr-2 size-4" />
								Logout
							</DropdownMenuItem>
						</SignOutButton>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
