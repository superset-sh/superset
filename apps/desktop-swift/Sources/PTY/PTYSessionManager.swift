import Foundation
import os

final class PTYSessionManager: @unchecked Sendable {
    static let shared = PTYSessionManager()

    private var sessions: [String: PTYSession] = [:]
    private var batchers: [String: OutputBatcher] = [:]
    private let lock = NSLock()
    private let logger = Logger(subsystem: "sh.superset.shell", category: "SessionManager")

    private init() {}

    @discardableResult
    func createSession(
        sessionId: String,
        cwd: String,
        onBatchReady: @escaping @Sendable (String, Data) -> Void,
        onExit: @escaping @Sendable (String, Int32, Int32) -> Void
    ) throws -> PTYSession {
        lock.lock()
        defer { lock.unlock() }

        if let existing = sessions[sessionId] {
            logger.info("Session \(sessionId) already exists, returning existing")
            return existing
        }

        let batcher = OutputBatcher(sessionId: sessionId) { sid, framedData in
            onBatchReady(sid, framedData)
        }

        let shell = ShellEnvironment.resolveLoginShell()
        let args = ShellEnvironment.shellLaunchArgs(shell: shell)
        let env = ShellEnvironment.buildTerminalEnv(cwd: cwd)

        let session = try PTYSession(
            sessionId: sessionId,
            shell: shell,
            arguments: args,
            environment: env,
            cwd: cwd,
            onOutput: { data in
                batcher.append(data)
            },
            onExit: { [weak self] code, signal in
                batcher.flush()
                onExit(sessionId, code, signal)
                self?.logger.info("Session \(sessionId) exited: code=\(code) signal=\(signal)")
            }
        )

        sessions[sessionId] = session
        batchers[sessionId] = batcher
        logger.info("Created session \(sessionId) with shell \(shell) in \(cwd)")
        return session
    }

    func session(for id: String) -> PTYSession? {
        lock.lock()
        defer { lock.unlock() }
        return sessions[id]
    }

    func batcher(for id: String) -> OutputBatcher? {
        lock.lock()
        defer { lock.unlock() }
        return batchers[id]
    }

    func activeSessionIds() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return sessions.filter { _, session in
            if case .active = session.state { return true }
            return false
        }.map(\.key)
    }

    func destroySession(_ id: String) {
        lock.lock()
        let session = sessions.removeValue(forKey: id)
        let batcher = batchers.removeValue(forKey: id)
        lock.unlock()

        batcher?.cancel()
        session?.kill()
        logger.info("Destroyed session \(id)")
    }

    func destroyAll() {
        lock.lock()
        let allSessions = sessions
        let allBatchers = batchers
        sessions.removeAll()
        batchers.removeAll()
        lock.unlock()

        for (_, batcher) in allBatchers { batcher.cancel() }
        for (_, session) in allSessions { session.kill() }
        logger.info("Destroyed all sessions")
    }
}
