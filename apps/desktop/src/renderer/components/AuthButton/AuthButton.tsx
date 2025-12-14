import { Avatar, AvatarFallback } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { FcGoogle } from "react-icons/fc";
import { LuGithub, LuLogOut, LuUser } from "react-icons/lu";
import { useAuth } from "renderer/hooks/useAuth";

/**
 * Authentication button component
 * Shows sign in options when logged out, user menu when logged in
 */
export function AuthButton() {
	const { isSignedIn, isLoading, signIn, signOut, isSigningIn } = useAuth();

	if (isLoading) {
		return (
			<Button variant="ghost" size="sm" disabled className="no-drag">
				<div className="size-4 animate-pulse rounded-full bg-muted" />
			</Button>
		);
	}

	if (!isSignedIn) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={isSigningIn}
						className="no-drag"
					>
						{isSigningIn ? "Signing in..." : "Sign in"}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem
						onClick={() => signIn("github")}
						className="flex items-center gap-2"
					>
						<LuGithub className="size-4" />
						<span>Continue with GitHub</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => signIn("google")}
						className="flex items-center gap-2"
					>
						<FcGoogle className="size-4" />
						<span>Continue with Google</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	// TODO: Fetch user data via tRPC when needed
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="no-drag gap-2 px-2">
					<Avatar className="size-6">
						<AvatarFallback className="text-xs">
							<LuUser className="size-3" />
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					onClick={() => signOut()}
					className="flex items-center gap-2 text-destructive focus:text-destructive"
				>
					<LuLogOut className="size-4" />
					<span>Sign out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
