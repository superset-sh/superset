import { Trans } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, MousePointer2, RotateCw } from "lucide-react";

export function AgentDrive() {
	return (
		<div
			aria-hidden="true"
			className="mt-12 grid overflow-hidden border border-border lg:grid-cols-2"
		>
			<div className="border-border border-b bg-background p-5 font-mono text-[12px] leading-relaxed lg:border-r lg:border-b-0">
				<p className="text-muted-foreground">claude</p>
				<div className="mt-3 space-y-2">
					<p className="text-foreground">
						&gt; <Trans>test the signup flow on my dev server</Trans>
					</p>
					<p className="text-muted-foreground">
						<span className="text-emerald-500">●</span> Bash(superset browser
						open --url http://localhost:3000/signup)
					</p>
					<p className="text-muted-foreground">
						<span className="text-emerald-500">●</span> Bash(superset browser
						cdp)
					</p>
					<p className="pl-3 text-muted-foreground">
						└{" "}
						<Trans>
							Filled the email and password, then clicked Create account
						</Trans>
					</p>
					<p className="text-muted-foreground">
						<span className="text-emerald-500">●</span> Bash(superset browser
						console)
					</p>
					<p className="pl-3 text-muted-foreground">└ 0 errors</p>
					<p className="text-muted-foreground">
						<span className="text-emerald-500">●</span> Bash(superset browser
						screenshot --out signup.png)
					</p>
					<p className="pt-2 text-foreground">
						<Trans>
							Signup works. The welcome screen loads and the console is clean.
						</Trans>
					</p>
				</div>
			</div>
			<div className="bg-card/40 p-5">
				<div className="overflow-hidden rounded-lg border border-border bg-background shadow-xl">
					<div className="flex h-9 items-center gap-2 border-border border-b px-3 text-muted-foreground">
						<ArrowLeft className="size-3.5" />
						<ArrowRight className="size-3.5" />
						<RotateCw className="size-3.5" />
						<span className="ml-1 flex-1 truncate rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
							http://localhost:3000/signup
						</span>
					</div>
					<div className="mx-auto max-w-xs px-6 py-10">
						<p className="font-medium text-foreground text-lg">
							<Trans>Create your account</Trans>
						</p>
						<p className="mt-5 text-muted-foreground text-xs">
							<Trans>Email</Trans>
						</p>
						<p className="mt-1 rounded-md border border-border px-3 py-2 text-foreground text-sm">
							maya@acme.com
						</p>
						<p className="mt-3 text-muted-foreground text-xs">
							<Trans>Password</Trans>
						</p>
						<p className="mt-1 rounded-md border border-border px-3 py-2 text-foreground text-sm tracking-widest">
							••••••••••
						</p>
						<div className="relative mt-5">
							<p className="rounded-md bg-foreground py-2 text-center font-medium text-background text-sm">
								<Trans>Create account</Trans>
							</p>
							<span className="absolute top-1/2 left-2/3 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/30" />
							<MousePointer2 className="absolute top-1/2 left-2/3 size-5 fill-foreground text-background" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
