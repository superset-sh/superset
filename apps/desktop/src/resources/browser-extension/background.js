// Superset Browser Extension - Background Service Worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "ping") {
		sendResponse({ type: "pong" });
		return true;
	}
});
