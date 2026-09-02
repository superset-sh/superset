import { observable } from "@trpc/server/observable";
import { session } from "electron";
import {
	type BrowserOpenRequest,
	browserManager,
	type ForwardedKey,
} from "main/lib/browser/browser-manager";
import { screenshotManager } from "main/lib/browser/screenshot-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createBrowserRouter = () => {
	return router({
		register: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					webContentsId: z.number(),
					// Optional: v1 browser panes register without workspace scoping
					// and stay invisible to the browser bridge.
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				browserManager.register(
					input.paneId,
					input.webContentsId,
					input.workspaceId,
				);
				return { success: true };
			}),

		unregister: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				browserManager.unregister(input.paneId);
				return { success: true };
			}),

		navigate: publicProcedure
			.input(z.object({ paneId: z.string(), url: z.string() }))
			.mutation(({ input }) => {
				browserManager.navigate(input.paneId, input.url);
				return { success: true };
			}),

		goBack: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (wc?.canGoBack()) wc.goBack();
				return { success: true };
			}),

		goForward: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (wc?.canGoForward()) wc.goForward();
				return { success: true };
			}),

		reload: publicProcedure
			.input(z.object({ paneId: z.string(), hard: z.boolean().optional() }))
			.mutation(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (!wc) return { success: false };
				if (input.hard) {
					wc.reloadIgnoringCache();
				} else {
					wc.reload();
				}
				return { success: true };
			}),

		screenshot: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async ({ input }) => {
				const { image, url } = await browserManager.screenshot(input.paneId);
				const saved = screenshotManager.save(image, url);
				return { base64: saved.base64, id: saved.id };
			}),

		evaluateJS: publicProcedure
			.input(z.object({ paneId: z.string(), code: z.string() }))
			.mutation(async ({ input }) => {
				const result = await browserManager.evaluateJS(
					input.paneId,
					input.code,
				);
				return { result };
			}),

		// --- Design mode (element picker) ---
		// Enable injects the picker overlay into the guest; disable cancels any
		// in-flight selection and removes the overlay.
		designModeSet: publicProcedure
			.input(z.object({ paneId: z.string(), enabled: z.boolean() }))
			.mutation(async ({ input }) => {
				const ok = await browserManager.setDesignMode(
					input.paneId,
					input.enabled,
				);
				return { ok };
			}),

		// Long-lived by design: resolves when the user clicks an element, cancels,
		// navigates away, or the controller's hard timeout fires.
		designModeAwaitSelection: publicProcedure
			.input(z.object({ paneId: z.string(), opId: z.string() }))
			.mutation(({ input }) => {
				return browserManager.awaitDesignSelection(input.paneId, input.opId);
			}),

		designModeCancel: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				browserManager.cancelDesignSelection(input.paneId);
				return { success: true };
			}),

		designModeScreenshot: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					rect: z.object({
						x: z.number(),
						y: z.number(),
						width: z.number(),
						height: z.number(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				const screenshot = await browserManager.captureDesignScreenshot(
					input.paneId,
					input.rect,
				);
				return { screenshot };
			}),

		getConsoleLogs: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(({ input }) => {
				return browserManager.getConsoleLogs(input.paneId);
			}),

		consoleStream: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{
					level: string;
					message: string;
					timestamp: number;
				}>((emit) => {
					const handler = (entry: {
						level: string;
						message: string;
						timestamp: number;
					}) => {
						emit.next(entry);
					};
					browserManager.on(`console:${input.paneId}`, handler);
					return () => {
						browserManager.off(`console:${input.paneId}`, handler);
					};
				});
			}),

		onNewWindow: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ url: string }>((emit) => {
					const handler = (url: string) => {
						emit.next({ url });
					};
					browserManager.on(`new-window:${input.paneId}`, handler);
					return () => {
						browserManager.off(`new-window:${input.paneId}`, handler);
					};
				});
			}),

		onContextMenuAction: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<{ action: string; url: string }>((emit) => {
					const handler = (data: { action: string; url: string }) => {
						emit.next(data);
					};
					browserManager.on(`context-menu-action:${input.paneId}`, handler);
					return () => {
						browserManager.off(`context-menu-action:${input.paneId}`, handler);
					};
				});
			}),

		onClosePane: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<void>((emit) => {
					const handler = () => {
						emit.next();
					};
					browserManager.on(`close-pane:${input.paneId}`, handler);
					return () => {
						browserManager.off(`close-pane:${input.paneId}`, handler);
					};
				});
			}),

		onReloadPane: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<void>((emit) => {
					const handler = () => {
						emit.next();
					};
					browserManager.on(`reload-pane:${input.paneId}`, handler);
					return () => {
						browserManager.off(`reload-pane:${input.paneId}`, handler);
					};
				});
			}),

		// Renderer-registered canonical chords the main process should suppress in
		// the focused guest and forward for replay (override/layout-aware).
		setForwardableChords: publicProcedure
			.input(z.object({ chords: z.array(z.string()) }))
			.mutation(({ input }) => {
				browserManager.setForwardableChords(input.chords);
				return { success: true };
			}),

		// Keystrokes intercepted from the focused guest webview, replayed by the
		// renderer into its hotkey system (guest focus hides them from the host).
		onKeyForward: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<ForwardedKey>((emit) => {
					const handler = (key: ForwardedKey) => {
						emit.next(key);
					};
					browserManager.on(`key-forward:${input.paneId}`, handler);
					return () => {
						browserManager.off(`key-forward:${input.paneId}`, handler);
					};
				});
			}),

		// External open requests (CLI/agents via the browser bridge). A global
		// renderer hook consumes these and routes them through the same
		// openUrl search-param flow the ports sidebar uses.
		onOpenRequest: publicProcedure.subscription(() => {
			return observable<BrowserOpenRequest>((emit) => {
				const handler = (request: BrowserOpenRequest) => {
					emit.next(request);
				};
				browserManager.on("open-request", handler);
				return () => {
					browserManager.off("open-request", handler);
				};
			});
		}),

		// Panes with agent work in flight (a live CDP session or an in-flight
		// capture). The renderer registry parks these presentable — a
		// visibility-hidden webview gets no compositor frames, so screenshots
		// hang — and exempts them from hidden-webview LRU eviction so a pane
		// isn't destroyed out from under an attached agent. Emits the full set
		// on every change, plus once on subscribe.
		onAgentActivePanes: publicProcedure.subscription(() => {
			return observable<{ paneIds: string[] }>((emit) => {
				const handler = (state: { paneIds: string[] }) => {
					emit.next(state);
				};
				browserManager.on("agent-active", handler);
				emit.next({ paneIds: browserManager.getAgentActivePaneIds() });
				return () => {
					browserManager.off("agent-active", handler);
				};
			});
		}),

		openDevTools: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(({ input }) => {
				browserManager.openDevTools(input.paneId);
				return { success: true };
			}),

		getPageInfo: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(({ input }) => {
				const wc = browserManager.getWebContents(input.paneId);
				if (!wc) return null;
				return {
					url: wc.getURL(),
					title: wc.getTitle(),
					canGoBack: wc.canGoBack(),
					canGoForward: wc.canGoForward(),
					isLoading: wc.isLoading(),
				};
			}),

		clearBrowsingData: publicProcedure
			.input(
				z.object({
					type: z.enum(["cookies", "cache", "storage", "all"]),
				}),
			)
			.mutation(async ({ input }) => {
				const ses = session.fromPartition("persist:superset");
				switch (input.type) {
					case "cookies":
						await ses.clearStorageData({ storages: ["cookies"] });
						break;
					case "cache":
						await ses.clearCache();
						break;
					case "storage":
						await ses.clearStorageData({
							storages: ["localstorage", "indexdb"],
						});
						break;
					case "all":
						await ses.clearStorageData();
						await ses.clearCache();
						break;
				}
				return { success: true };
			}),

		// Chrome's "device toolbar" — a fixed viewport size for responsive
		// testing. null clears the emulation and returns to the real window size.
		setDeviceEmulation: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					params: z
						.object({ width: z.number(), height: z.number() })
						.nullable(),
				}),
			)
			.mutation(({ input }) => {
				browserManager.setDeviceEmulation(input.paneId, input.params);
				return { success: true };
			}),

		// Sites the browser session has cookies for — the closest thing to
		// "signed-in sites" this app can show without a real credential vault
		// (imported "logins" are cookies, not stored passwords).
		getCookieDomains: publicProcedure.query(async () => {
			const cookies = await session
				.fromPartition("persist:superset")
				.cookies.get({});
			const domains = new Map<string, number>();
			for (const cookie of cookies) {
				if (!cookie.domain) continue;
				const domain = cookie.domain.replace(/^\./, "");
				domains.set(domain, (domains.get(domain) ?? 0) + 1);
			}
			return [...domains.entries()]
				.map(([domain, cookieCount]) => ({ domain, cookieCount }))
				.sort((a, b) => a.domain.localeCompare(b.domain));
		}),

		clearCookiesForDomain: publicProcedure
			.input(z.object({ domain: z.string() }))
			.mutation(async ({ input }) => {
				const ses = session.fromPartition("persist:superset");
				const cookies = await ses.cookies.get({ domain: input.domain });
				await Promise.all(
					cookies.map((cookie) => {
						const scheme = cookie.secure ? "https" : "http";
						const domain = (cookie.domain ?? input.domain).replace(/^\./, "");
						const url = `${scheme}://${domain}${cookie.path}`;
						return ses.cookies.remove(url, cookie.name);
					}),
				);
				return { success: true };
			}),
	});
};
