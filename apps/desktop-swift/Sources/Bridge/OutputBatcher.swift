import Foundation
import os

final class OutputBatcher: @unchecked Sendable {
    let sessionId: String

    private let onFlush: @Sendable (String, Data) -> Void
    private var buffer = Data()
    private var replay = Data()
    private let lock = NSLock()
    private var timer: DispatchSourceTimer?
    private var cancelled = false

    static let maxFlushBytes = 16384       // 16 KB
    static let debounceInterval: TimeInterval = 0.012  // 12ms
    static let replayBufferLimit = 262144  // 256 KB

    // Frame types
    static let frameTypeData: UInt8 = 0x01
    static let frameTypeExit: UInt8 = 0x02
    static let frameTypeError: UInt8 = 0x03

    private let timerQueue = DispatchQueue(label: "sh.superset.batcher", qos: .userInteractive)
    private let logger = Logger(subsystem: "sh.superset.shell", category: "Batcher")

    init(sessionId: String, onFlush: @escaping @Sendable (String, Data) -> Void) {
        self.sessionId = sessionId
        self.onFlush = onFlush
    }

    func append(_ data: Data) {
        lock.lock()
        buffer.append(data)
        // Also append to replay buffer (raw, unframed)
        replay.append(data)
        if replay.count > Self.replayBufferLimit {
            replay = Data(replay.suffix(Self.replayBufferLimit))
        }
        let size = buffer.count
        lock.unlock()

        if size >= Self.maxFlushBytes {
            flush()
        } else {
            scheduleTimer()
        }
    }

    func flush() {
        lock.lock()
        guard !buffer.isEmpty else { lock.unlock(); return }
        let chunk = buffer
        buffer = Data()
        cancelTimer()
        lock.unlock()

        let framed = Self.makeDataFrame(chunk)
        onFlush(sessionId, framed)
    }

    /// Returns a framed replay of all buffered raw output (for reconnect after WebView crash).
    func replayBuffer() -> Data? {
        lock.lock()
        let raw = replay
        lock.unlock()
        guard !raw.isEmpty else { return nil }
        return Self.makeDataFrame(raw)
    }

    func cancel() {
        lock.lock()
        cancelled = true
        cancelTimer()
        lock.unlock()
    }

    private func scheduleTimer() {
        lock.lock()
        guard timer == nil, !cancelled else { lock.unlock(); return }
        let t = DispatchSource.makeTimerSource(queue: timerQueue)
        t.schedule(deadline: .now() + Self.debounceInterval)
        t.setEventHandler { [weak self] in
            self?.flush()
        }
        timer = t
        t.resume()
        lock.unlock()
    }

    private func cancelTimer() {
        // Caller holds lock
        timer?.cancel()
        timer = nil
    }

    // MARK: - Frame construction

    /// Wraps raw payload in a length-prefixed frame: [type:1][length:4 BE][payload]
    static func makeFrame(type: UInt8, payload: Data) -> Data {
        var frame = Data(capacity: 5 + payload.count)
        frame.append(type)
        let len = UInt32(payload.count)
        frame.append(UInt8((len >> 24) & 0xff))
        frame.append(UInt8((len >> 16) & 0xff))
        frame.append(UInt8((len >> 8) & 0xff))
        frame.append(UInt8(len & 0xff))
        frame.append(payload)
        return frame
    }

    static func makeDataFrame(_ payload: Data) -> Data {
        makeFrame(type: frameTypeData, payload: payload)
    }

    static func makeExitFrame(code: Int32, signal: Int32) -> Data {
        let json = "{\"code\":\(code),\"signal\":\(signal)}"
        return makeFrame(type: frameTypeExit, payload: json.data(using: .utf8)!)
    }

    static func makeErrorFrame(message: String) -> Data {
        makeFrame(type: frameTypeError, payload: message.data(using: .utf8)!)
    }
}
