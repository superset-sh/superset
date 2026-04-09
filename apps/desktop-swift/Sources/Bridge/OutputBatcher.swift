import Foundation

/// Temporary placeholder — will be fully implemented in Task 6
final class OutputBatcher: @unchecked Sendable {
    let sessionId: String
    private let onFlush: @Sendable (String, Data) -> Void

    init(sessionId: String, onFlush: @escaping @Sendable (String, Data) -> Void) {
        self.sessionId = sessionId
        self.onFlush = onFlush
    }
    func append(_ data: Data) {}
    func flush() {}
    func cancel() {}
    func replayBuffer() -> Data? { nil }
}
