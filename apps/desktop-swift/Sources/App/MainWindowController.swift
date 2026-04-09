import AppKit
import WebKit
import os

final class MainWindowController: NSObject, WKNavigationDelegate {

    let window: NSWindow
    private(set) var webView: WKWebView!
    private let schemeHandler = SupersetSchemeHandler()
    private var controlHandler: ControlMessageHandler!
    private let sessionManager = PTYSessionManager.shared
    private let logger = Logger(subsystem: "sh.superset.shell", category: "Window")

    override init() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init()

        window.title = "Superset"
        window.center()
        window.setFrameAutosaveName("SupersetMainWindow")
        window.minSize = NSSize(width: 640, height: 480)

        setupWebView()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "superset")

        controlHandler = ControlMessageHandler(schemeHandler: schemeHandler, windowController: self)
        config.userContentController.add(controlHandler, name: "superset")

        #if DEBUG
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView!.addSubview(webView)
    }

    func loadWebContent() {
        guard let resourceURL = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "WebContent"
        ) else {
            logger.fault("WebContent/index.html not found in app bundle")
            return
        }

        let directoryURL = resourceURL.deletingLastPathComponent()
        webView.loadFileURL(resourceURL, allowingReadAccessTo: directoryURL)
    }

    /// Creates only the PTY session (no JS call). Output accumulates in the replay buffer.
    /// JS initTerminal is called later from didFinish navigation delegate.
    func createPTYSession(sessionId: String, cwd: String) {
        do {
            try sessionManager.createSession(
                sessionId: sessionId,
                cwd: cwd,
                onBatchReady: { [weak self] id, data in
                    DispatchQueue.main.async {
                        self?.schemeHandler.sendBatch(sessionId: id, data: data)
                    }
                },
                onExit: { [weak self] id, code, signal in
                    DispatchQueue.main.async {
                        self?.schemeHandler.finishStream(sessionId: id, exitCode: code, signal: signal)
                    }
                }
            )
            logger.info("PTY session \(sessionId) created, waiting for WebView to init terminal")
        } catch {
            logger.error("Failed to create PTY session: \(error.localizedDescription)")
        }
    }

    // MARK: - WKNavigationDelegate (crash recovery)

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logger.warning("WebContent process terminated — reloading")
        schemeHandler.invalidateAllStreams()
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Note: module scripts load async, so __superset may not be available yet.
        // Terminal initialization is triggered by the "ready" control message from JS instead.
        logger.info("WebView navigation finished")
    }

    /// Called by ControlMessageHandler when JS sends { action: "ready" }.
    func handleJSReady() {
        let activeIds = sessionManager.activeSessionIds()
        guard !activeIds.isEmpty else {
            logger.info("JS ready but no active sessions")
            return
        }
        logger.info("JS ready — initializing \(activeIds.count) terminal(s)")
        for sessionId in activeIds {
            let escapedId = sessionId.replacingOccurrences(of: "\"", with: "\\\"")
            webView.evaluateJavaScript("""
                window.__superset.initTerminal("\(escapedId)", document.getElementById("terminal-container"));
            """)
        }
    }
}
