import {
	DESIGN_MODE_BUDGET,
	type DesignModeRect,
	type DesignModeScreenshot,
} from "shared/browser-design-mode";

const HIDE_OVERLAY_SCRIPT = `(function(){
  var d = window.__supersetDesignMode;
  if (d && d.host) d.host.style.display = 'none';
})()`;

const RESTORE_OVERLAY_SCRIPT = `(function(){
  var d = window.__supersetDesignMode;
  if (d && d.host) d.host.style.display = '';
})()`;

/**
 * Capture a screenshot of the guest page cropped to the given CSS-pixel rect.
 * Returns null on any failure — a missing screenshot is non-fatal for the
 * design-mode flow.
 *
 * `capture` is injected so the caller can supply the hardened capture path
 * (agent wake + per-attempt timeout + retry) — a bare `capturePage()` hangs
 * indefinitely on a hidden or throttled pane.
 */
export async function captureDesignModeScreenshot(
	rect: DesignModeRect,
	guest: Electron.WebContents,
	capture: () => Promise<Electron.NativeImage>,
): Promise<DesignModeScreenshot | null> {
	try {
		// The rect crosses IPC from the renderer; keep NaN out of image.crop().
		const safeN = (n: unknown): number =>
			typeof n === "number" && Number.isFinite(n) ? n : 0;
		const safeRect = {
			x: safeN(rect.x),
			y: safeN(rect.y),
			width: safeN(rect.width),
			height: safeN(rect.height),
		};

		// Hide the selection overlay so the highlight box and label don't appear
		// in the capture; always restore it, even when capturePage throws.
		await guest.executeJavaScript(HIDE_OVERLAY_SCRIPT).catch(() => {});
		let image: Electron.NativeImage;
		try {
			image = await capture();
		} finally {
			await guest.executeJavaScript(RESTORE_OVERLAY_SCRIPT).catch(() => {});
		}
		if (image.isEmpty()) return null;

		// capturePage returns physical pixels while the rect is CSS pixels. The
		// combined scale factor (zoom × device scale) is derived empirically from
		// the guest's CSS viewport width, which stays correct on multi-monitor
		// setups with mixed DPI where the primary display's factor would be wrong.
		const bitmapSize = image.getSize();
		const viewportCssWidth: number =
			await guest.executeJavaScript("window.innerWidth");
		if (!viewportCssWidth || viewportCssWidth <= 0) return null;
		const scaleFactor = bitmapSize.width / viewportCssWidth;

		// Clip to the viewport in CSS space first: an element partially scrolled
		// offscreen must crop to its visible region — clamping only the origin
		// would shift the crop onto unrelated content below/right of it.
		const visX = Math.max(0, safeRect.x);
		const visY = Math.max(0, safeRect.y);
		const visW = safeRect.width - (visX - safeRect.x);
		const visH = safeRect.height - (visY - safeRect.y);
		const cropX = Math.round(visX * scaleFactor);
		const cropY = Math.round(visY * scaleFactor);
		const cropW = Math.min(
			bitmapSize.width - cropX,
			Math.round(visW * scaleFactor),
		);
		const cropH = Math.min(
			bitmapSize.height - cropY,
			Math.round(visH * scaleFactor),
		);
		if (cropW <= 0 || cropH <= 0) return null;

		const pngBuffer = image
			.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
			.toPNG();
		// Fail closed to "no screenshot" rather than send an oversized payload.
		if (pngBuffer.byteLength > DESIGN_MODE_BUDGET.screenshotMaxBytes) {
			return null;
		}

		return {
			mimeType: "image/png",
			dataUrl: `data:image/png;base64,${pngBuffer.toString("base64")}`,
			// Report CSS pixels so the dimensions match rectViewport/rectPage.
			width: Math.round(cropW / scaleFactor),
			height: Math.round(cropH / scaleFactor),
		};
	} catch {
		// Capture can fail while the guest is being torn down. Fail closed.
		return null;
	}
}
