import { Router } from "lib/electron-router-dom";
import { Route, useRouteError } from "react-router-dom";

import { MainScreen } from "./screens/main";

function ErrorPage() {
	const error = useRouteError() as Error;

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-neutral-950 p-8">
			<div className="w-full max-w-4xl space-y-6">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold text-red-500">
						Unexpected Application Error!
					</h1>
					<p className="text-neutral-400 text-lg">
						An error occurred in the application. You can copy the error details
						below:
					</p>
				</div>

				<div className="space-y-4">
					<div className="space-y-2">
						<h2 className="text-xl font-semibold text-neutral-200">
							Error Message
						</h2>
						<pre className="overflow-auto rounded-lg bg-neutral-900 border border-neutral-800 p-4 text-base">
							<code className="text-red-400 select-all">
								{error?.toString()}
							</code>
						</pre>
					</div>

					{error?.stack && (
						<div className="space-y-2">
							<h2 className="text-xl font-semibold text-neutral-200">
								Stack Trace
							</h2>
							<pre className="max-h-96 overflow-auto rounded-lg bg-neutral-900 border border-neutral-800 p-4 text-sm font-mono">
								<code className="text-neutral-300 select-all">
									{error.stack}
								</code>
							</pre>
						</div>
					)}
				</div>

				<div className="flex gap-3">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 transition-colors"
					>
						Reload App
					</button>
					<button
						type="button"
						onClick={() => {
							const errorText = `Error: ${error?.toString()}\n\nStack Trace:\n${error?.stack}`;
							navigator.clipboard.writeText(errorText);
						}}
						className="rounded-md border-2 border-neutral-700 bg-neutral-900 px-6 py-3 text-base font-medium text-neutral-200 hover:bg-neutral-800 hover:border-neutral-600 transition-colors"
					>
						Copy Error Details
					</button>
				</div>
			</div>
		</div>
	);
}

export function AppRoutes() {
	return (
		<Router
			main={
				<Route element={<MainScreen />} path="/" errorElement={<ErrorPage />} />
			}
		/>
	);
}
