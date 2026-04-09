import Darwin
import Dispatch
import Foundation
import os

// MARK: - Types

enum PTYSessionState: Sendable {
    case active
    case exited(code: Int32, signal: Int32)
    case disposed
}

enum PTYError: Error, Sendable {
    case forkFailed(errno: Int32)
}

// MARK: - PTYSession

final class PTYSession: @unchecked Sendable {
    private let logger = Logger(subsystem: "sh.superset.shell", category: "PTY")

    let sessionId: String
    private let masterFd: Int32
    private let childPid: pid_t

    private let readSource: DispatchSourceRead
    private let processSource: DispatchSourceProcess

    private var writeSource: DispatchSourceWrite?
    private var writeBuffer = Data()
    private let maxWriteBuffer = 65_536 // 64 KB

    private let queue = DispatchQueue(label: "sh.superset.shell.pty", qos: .userInteractive)
    private let onOutput: @Sendable (Data) -> Void
    private let onExit: @Sendable (Int32, Int32) -> Void

    private(set) var state: PTYSessionState = .active

    // MARK: - Init

    init(
        sessionId: String,
        shell: String,
        arguments: [String] = [],
        environment: [String: String] = [:],
        cwd: String? = nil,
        cols: UInt16 = 80,
        rows: UInt16 = 24,
        onOutput: @escaping @Sendable (Data) -> Void,
        onExit: @escaping @Sendable (Int32, Int32) -> Void
    ) throws {
        self.sessionId = sessionId
        self.onOutput = onOutput
        self.onExit = onExit

        // Prepare winsize
        var ws = winsize()
        ws.ws_col = cols
        ws.ws_row = rows

        // Fork PTY
        var fd: Int32 = -1
        let pid = forkpty(&fd, nil, nil, &ws)

        guard pid >= 0 else {
            throw PTYError.forkFailed(errno: Darwin.errno)
        }

        if pid == 0 {
            // --- Child process ---
            if let cwd = cwd {
                _ = Darwin.chdir(cwd)
            }

            // Build argv
            var allArgs = [shell] + arguments
            let argv: [UnsafeMutablePointer<CChar>?] = allArgs.map { strdup($0) } + [nil]

            // Build envp
            var envPairs = environment.map { "\($0.key)=\($0.value)" }
            let envp: [UnsafeMutablePointer<CChar>?] = envPairs.map { strdup($0) } + [nil]

            execve(shell, argv, envp)
            // If we get here, execve failed
            _exit(1)
        }

        // --- Parent process ---
        self.masterFd = fd
        self.childPid = pid

        // Set non-blocking
        let flags = fcntl(fd, F_GETFL)
        fcntl(fd, F_SETFL, flags | O_NONBLOCK)

        // Set up read source
        self.readSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        self.processSource = DispatchSource.makeProcessSource(
            identifier: pid, eventMask: .exit, queue: queue
        )

        // Read handler
        readSource.setEventHandler { [weak self] in
            self?.handleRead()
        }
        readSource.setCancelHandler { [weak self] in
            guard let self else { return }
            Darwin.close(self.masterFd)
        }

        // Process exit handler
        processSource.setEventHandler { [weak self] in
            self?.handleExit()
        }

        readSource.resume()
        processSource.resume()

        logger.info("PTY session \(sessionId) started: pid=\(pid) fd=\(fd)")
    }

    deinit {
        kill()
    }

    // MARK: - Read

    private func handleRead() {
        let bufferSize = 16_384 // 16 KB
        var buffer = [UInt8](repeating: 0, count: bufferSize)

        while true {
            let bytesRead = Darwin.read(masterFd, &buffer, bufferSize)
            if bytesRead > 0 {
                let data = Data(buffer[0..<bytesRead])
                onOutput(data)
            } else if bytesRead == 0 {
                // EOF
                break
            } else {
                let err = Darwin.errno
                if err == EAGAIN || err == EWOULDBLOCK {
                    break
                }
                // Real error — stop reading
                logger.error("PTY read error: \(err)")
                break
            }
        }
    }

    // MARK: - Exit

    private func handleExit() {
        var status: Int32 = 0
        waitpid(childPid, &status, 0)

        let code: Int32
        let sig: Int32

        // Manual WIFEXITED/WEXITSTATUS/WIFSIGNALED/WTERMSIG (Swift lacks C macros)
        if (status & 0x7F) == 0 {
            // WIFEXITED — normal exit
            code = (status >> 8) & 0xFF
            sig = 0
        } else if (status & 0x7F) != 0x7F && (status & 0x7F) != 0 {
            // WIFSIGNALED
            code = -1
            sig = status & 0x7F
        } else {
            code = -1
            sig = -1
        }

        state = .exited(code: code, signal: sig)
        logger.info("PTY session \(self.sessionId) exited: code=\(code) signal=\(sig)")

        readSource.cancel()
        processSource.cancel()

        onExit(code, sig)
    }

    // MARK: - Write with backpressure

    func write(_ data: Data) {
        queue.async { [weak self] in
            guard let self else { return }
            guard case .active = self.state else { return }

            if self.writeBuffer.isEmpty {
                // Try direct write
                let remaining = self.directWrite(data)
                if !remaining.isEmpty {
                    self.enqueueWrite(remaining)
                }
            } else {
                self.enqueueWrite(data)
            }
        }
    }

    private func directWrite(_ data: Data) -> Data {
        return data.withUnsafeBytes { rawBuffer -> Data in
            guard let base = rawBuffer.baseAddress else { return Data() }
            let written = Darwin.write(masterFd, base, data.count)
            if written < 0 {
                let err = Darwin.errno
                if err == EAGAIN || err == EWOULDBLOCK {
                    return data
                }
                logger.error("PTY write error: \(err)")
                return Data()
            }
            if written < data.count {
                return data.suffix(from: written).asData
            }
            return Data()
        }
    }

    private func enqueueWrite(_ data: Data) {
        let available = maxWriteBuffer - writeBuffer.count
        guard available > 0 else {
            logger.warning("PTY write buffer full, dropping \(data.count) bytes")
            return
        }
        let toEnqueue = data.prefix(available)
        writeBuffer.append(contentsOf: toEnqueue)
        armWriteSource()
    }

    private func armWriteSource() {
        guard writeSource == nil else { return }
        let source = DispatchSource.makeWriteSource(fileDescriptor: masterFd, queue: queue)
        source.setEventHandler { [weak self] in
            self?.drainWriteBuffer()
        }
        source.setCancelHandler { [weak self] in
            self?.writeSource = nil
        }
        writeSource = source
        source.resume()
    }

    private func drainWriteBuffer() {
        guard !writeBuffer.isEmpty else {
            writeSource?.cancel()
            writeSource = nil
            return
        }

        let remaining = directWrite(writeBuffer)
        writeBuffer = remaining

        if writeBuffer.isEmpty {
            writeSource?.cancel()
            writeSource = nil
        }
    }

    // MARK: - Resize

    func resize(cols: UInt16, rows: UInt16) {
        queue.async { [weak self] in
            guard let self else { return }
            guard case .active = self.state else { return }
            var ws = winsize()
            ws.ws_col = cols
            ws.ws_row = rows
            _ = ioctl(self.masterFd, UInt(TIOCSWINSZ), &ws)
            self.logger.info("PTY session \(self.sessionId) resized: \(cols)x\(rows)")
        }
    }

    // MARK: - Kill

    func kill() {
        queue.async { [weak self] in
            guard let self else { return }
            guard case .active = self.state else { return }
            self.state = .disposed
            Darwin.kill(self.childPid, SIGHUP)
            self.readSource.cancel()
            self.processSource.cancel()
            self.writeSource?.cancel()
            self.writeSource = nil
            self.logger.info("PTY session \(self.sessionId) killed")
        }
    }
}

// MARK: - Data.SubSequence Helper

extension Data.SubSequence {
    var asData: Data {
        Data(self)
    }
}
