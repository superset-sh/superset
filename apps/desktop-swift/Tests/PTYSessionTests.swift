import Foundation
import Testing

@testable import SupersetShell

// Thread-safe box for use in sendable closures
final class AtomicBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T

    init(_ value: T) {
        _value = value
    }

    var value: T {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); defer { lock.unlock() }; _value = newValue }
    }

    func modify(_ transform: (inout T) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        transform(&_value)
    }
}

// Simple expectation helper for Swift Testing (no XCTest expectations)
final class Expectation: @unchecked Sendable {
    let description: String
    private let lock = NSLock()
    private var _isFulfilled = false

    var isFulfilled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isFulfilled
    }

    init(description: String) {
        self.description = description
    }

    func fulfill() {
        lock.lock()
        defer { lock.unlock() }
        _isFulfilled = true
    }
}

@Suite("PTYSession Tests")
struct PTYSessionTests {

    @Test("Session produces output")
    func testSessionProducesOutput() async throws {
        let outputReceived = Expectation(description: "output received")
        let collectedOutput = AtomicBox(Data())

        let session = try PTYSession(
            sessionId: "test-output",
            shell: "/bin/echo",
            arguments: ["hello"],
            onOutput: { data in
                collectedOutput.modify { $0.append(data) }
                if let str = String(data: collectedOutput.value, encoding: .utf8),
                   str.contains("hello")
                {
                    outputReceived.fulfill()
                }
            },
            onExit: { _, _ in }
        )

        await waitFor(outputReceived, timeout: 5.0)
        let output = String(data: collectedOutput.value, encoding: .utf8) ?? ""
        #expect(output.contains("hello"))
        _ = session // keep alive
    }

    @Test("Session detects exit")
    func testSessionDetectsExit() async throws {
        let exitReceived = Expectation(description: "exit received")
        let exitCode = AtomicBox<Int32>(-1)

        let session = try PTYSession(
            sessionId: "test-exit",
            shell: "/usr/bin/true",
            onOutput: { _ in },
            onExit: { code, _ in
                exitCode.value = code
                exitReceived.fulfill()
            }
        )

        await waitFor(exitReceived, timeout: 5.0)
        #expect(exitCode.value == 0)

        if case .exited(let code, _) = session.state {
            #expect(code == 0)
        } else {
            Issue.record("Expected .exited state")
        }
    }

    @Test("Resize does not crash")
    func testResize() async throws {
        let session = try PTYSession(
            sessionId: "test-resize",
            shell: "/bin/cat",
            onOutput: { _ in },
            onExit: { _, _ in }
        )

        session.resize(cols: 120, rows: 40)
        session.resize(cols: 200, rows: 50)

        // Small delay to ensure resize ioctls are processed
        try await Task.sleep(nanoseconds: 100_000_000)

        session.kill()

        // Give time for kill to process
        try await Task.sleep(nanoseconds: 200_000_000)
    }

    @Test("Write to session echoes back")
    func testWriteToSession() async throws {
        let outputReceived = Expectation(description: "echo received")
        let collectedOutput = AtomicBox(Data())

        let session = try PTYSession(
            sessionId: "test-write",
            shell: "/bin/cat",
            onOutput: { data in
                collectedOutput.modify { $0.append(data) }
                if let str = String(data: collectedOutput.value, encoding: .utf8),
                   str.contains("testinput")
                {
                    outputReceived.fulfill()
                }
            },
            onExit: { _, _ in }
        )

        // Small delay for cat to start
        try await Task.sleep(nanoseconds: 100_000_000)
        session.write(Data("testinput".utf8))

        await waitFor(outputReceived, timeout: 5.0)
        let output = String(data: collectedOutput.value, encoding: .utf8) ?? ""
        #expect(output.contains("testinput"))

        session.kill()
    }

    @Test("Write after exit is ignored")
    func testWriteAfterExitIsIgnored() async throws {
        let exitReceived = Expectation(description: "exit received")

        let session = try PTYSession(
            sessionId: "test-write-after-exit",
            shell: "/usr/bin/true",
            onOutput: { _ in },
            onExit: { _, _ in
                exitReceived.fulfill()
            }
        )

        await waitFor(exitReceived, timeout: 5.0)

        // Write after exit — should not crash
        session.write(Data("this should be ignored".utf8))

        // Small delay to confirm no crash
        try await Task.sleep(nanoseconds: 200_000_000)
    }

    // MARK: - Helpers

    private func waitFor(_ expectation: Expectation, timeout: TimeInterval) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !expectation.isFulfilled && Date() < deadline {
            try? await Task.sleep(nanoseconds: 10_000_000) // 10ms poll
        }
    }
}
