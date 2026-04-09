import WebKit
import os

final class SupersetSchemeHandler: NSObject, WKURLSchemeHandler {

    private let sessionManager = PTYSessionManager.shared
    private var activeStreams: [String: WKURLSchemeTask] = [:]
    private let lock = NSLock()
    private let logger = Logger(subsystem: "sh.superset.shell", category: "SchemeHandler")

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(SchemeError.invalidURL)
            return
        }

        let path = url.path
        let segments = path.split(separator: "/").map(String.init)

        guard segments.count >= 2, segments[0] == "terminal" else {
            fail(urlSchemeTask, status: 404)
            return
        }

        let action = segments[1]
        let sessionId = segments.count > 2 ? segments[2] : ""

        switch action {
        case "stream":
            handleStream(sessionId: sessionId, task: urlSchemeTask)
        case "input":
            handleInput(sessionId: sessionId, task: urlSchemeTask)
        default:
            fail(urlSchemeTask, status: 404)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        for (id, task) in activeStreams {
            if task === urlSchemeTask {
                activeStreams.removeValue(forKey: id)
                break
            }
        }
        lock.unlock()
    }

    // MARK: - Stream (PTY output → JS)

    private func handleStream(sessionId: String, task: WKURLSchemeTask) {
        guard sessionManager.session(for: sessionId) != nil else {
            fail(task, status: 404)
            return
        }

        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "application/octet-stream",
                "Cache-Control": "no-cache, no-store",
            ]
        )!
        task.didReceive(response)

        // Deliver replay buffer if available
        if let replay = sessionManager.batcher(for: sessionId)?.replayBuffer() {
            task.didReceive(replay)
        }

        lock.lock()
        activeStreams[sessionId] = task
        lock.unlock()

        logger.info("Stream connected for session \(sessionId)")
    }

    /// Called by the batcher when a framed batch is ready.
    func sendBatch(sessionId: String, data: Data) {
        lock.lock()
        guard let task = activeStreams[sessionId] else {
            lock.unlock()
            return
        }
        lock.unlock()

        task.didReceive(data)
    }

    /// Sends an exit frame and finishes the stream response.
    func finishStream(sessionId: String, exitCode: Int32, signal: Int32) {
        lock.lock()
        guard let task = activeStreams.removeValue(forKey: sessionId) else {
            lock.unlock()
            return
        }
        lock.unlock()

        let exitFrame = OutputBatcher.makeExitFrame(code: exitCode, signal: signal)
        task.didReceive(exitFrame)
        task.didFinish()
        logger.info("Stream finished for session \(sessionId)")
    }

    /// Invalidates all active streams (e.g., after WebView crash).
    func invalidateAllStreams() {
        lock.lock()
        let count = activeStreams.count
        activeStreams.removeAll()
        lock.unlock()
        logger.info("Invalidated \(count) active streams")
    }

    // MARK: - Input (JS → PTY)

    private func handleInput(sessionId: String, task: WKURLSchemeTask) {
        guard let session = sessionManager.session(for: sessionId) else {
            fail(task, status: 404)
            return
        }

        if let body = task.request.httpBody, !body.isEmpty {
            session.write(body)
        }

        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 204,
            httpVersion: "HTTP/1.1",
            headerFields: nil
        )!
        task.didReceive(response)
        task.didFinish()
    }

    // MARK: - Helpers

    private func fail(_ task: WKURLSchemeTask, status: Int) {
        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: nil
        )!
        task.didReceive(response)
        task.didFinish()
    }
}

enum SchemeError: Error {
    case invalidURL
}
