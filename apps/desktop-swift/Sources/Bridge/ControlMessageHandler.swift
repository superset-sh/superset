import WebKit
import os

final class ControlMessageHandler: NSObject, WKScriptMessageHandler {

    private let sessionManager = PTYSessionManager.shared
    private weak var schemeHandler: SupersetSchemeHandler?
    private weak var windowController: MainWindowController?
    private let logger = Logger(subsystem: "sh.superset.shell", category: "ControlHandler")

    init(schemeHandler: SupersetSchemeHandler, windowController: MainWindowController) {
        self.schemeHandler = schemeHandler
        self.windowController = windowController
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            logger.warning("Invalid control message: \(String(describing: message.body))")
            return
        }

        switch action {
        case "createSession":
            handleCreateSession(body)
        case "destroySession":
            handleDestroySession(body)
        case "resize":
            handleResize(body)
        case "ready":
            logger.info("WebView JS layer ready")
            windowController?.handleJSReady()
        default:
            logger.warning("Unknown control action: \(action)")
        }
    }

    private func handleCreateSession(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String,
              let cwd = body["cwd"] as? String else {
            logger.error("createSession missing sessionId or cwd")
            return
        }

        do {
            try sessionManager.createSession(
                sessionId: sessionId,
                cwd: cwd,
                onBatchReady: { [weak self] id, data in
                    DispatchQueue.main.async {
                        self?.schemeHandler?.sendBatch(sessionId: id, data: data)
                    }
                },
                onExit: { [weak self] id, code, signal in
                    DispatchQueue.main.async {
                        self?.schemeHandler?.finishStream(sessionId: id, exitCode: code, signal: signal)
                    }
                }
            )
            logger.info("Session \(sessionId) created via control message")
        } catch {
            logger.error("Failed to create session \(sessionId): \(error.localizedDescription)")
        }
    }

    private func handleDestroySession(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String else { return }
        sessionManager.destroySession(sessionId)
    }

    private func handleResize(_ body: [String: Any]) {
        guard let sessionId = body["sessionId"] as? String,
              let cols = body["cols"] as? Int,
              let rows = body["rows"] as? Int else { return }
        sessionManager.session(for: sessionId)?.resize(
            cols: UInt16(clamping: max(1, cols)),
            rows: UInt16(clamping: max(1, rows))
        )
    }
}
