import AVFoundation
import Foundation

final class ComposerAudioRecording {
  let url = FileManager.default.temporaryDirectory
    .appendingPathComponent("dictation-\(UUID().uuidString).m4a")
  private let lock = NSLock()
  private var converter: AVAudioConverter
  private let outputFormat: AVAudioFormat
  private var file: AVAudioFile?
  private var frames: AVAudioFramePosition = 0
  private var failure: Error?

  init(format: AVAudioFormat) throws {
    guard let output = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: 16_000,
      channels: 1, interleaved: false
    ) else {
      throw NSError(domain: "ComposerAudioRecording", code: 1)
    }
    var initialConverter: AVAudioConverter?
    try ComposerExceptionGuard.run {
      initialConverter = AVAudioConverter(from: format, to: output)
    }
    guard let initialConverter else {
      throw NSError(domain: "ComposerAudioRecording", code: 1)
    }
    converter = initialConverter
    outputFormat = output
    file = try AVAudioFile(forWriting: url, settings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 16_000,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 32_000,
    ], commonFormat: .pcmFormatFloat32, interleaved: false)
  }

  func append(_ input: AVAudioPCMBuffer) {
    lock.lock()
    defer { lock.unlock() }
    guard let file, failure == nil else { return }
    do {
      guard input.format.sampleRate > 0, input.format.channelCount > 0 else {
        throw NSError(domain: "ComposerAudioRecording", code: 1)
      }
      if !converter.inputFormat.isEqual(input.format) {
        var replacement: AVAudioConverter?
        try ComposerExceptionGuard.run {
          replacement = AVAudioConverter(from: input.format, to: outputFormat)
        }
        guard let replacement else {
          throw NSError(domain: "ComposerAudioRecording", code: 1)
        }
        converter = replacement
      }
      let capacity = AVAudioFrameCount(
        ceil(Double(input.frameLength) * 16_000 / input.format.sampleRate) + 32
      )
      guard let output = AVAudioPCMBuffer(
        pcmFormat: outputFormat, frameCapacity: capacity
      ) else { throw NSError(domain: "ComposerAudioRecording", code: 2) }
      var supplied = false
      var error: NSError?
      var status: AVAudioConverterOutputStatus = .error
      try ComposerExceptionGuard.run {
        status = converter.convert(to: output, error: &error) { _, state in
          if supplied {
            state.pointee = .noDataNow
            return nil
          }
          supplied = true
          state.pointee = .haveData
          return input
        }
      }
      if status == .error {
        throw error ?? NSError(domain: "ComposerAudioRecording", code: 2)
      }
      let remaining = AVAudioFramePosition(16_000 * 300) - frames
      output.frameLength = min(output.frameLength, AVAudioFrameCount(max(0, remaining)))
      try file.write(from: output)
      frames += AVAudioFramePosition(output.frameLength)
    } catch {
      failure = error
    }
  }

  func finish() throws -> Double {
    lock.lock()
    defer { lock.unlock() }
    if failure == nil, let file,
      let tail = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: 512) {
      var error: NSError?
      var status: AVAudioConverterOutputStatus = .error
      do {
        try ComposerExceptionGuard.run {
          status = converter.convert(to: tail, error: &error) { _, state in
            state.pointee = .endOfStream
            return nil
          }
        }
      } catch { failure = error }
      if status == .error {
        failure = failure ?? error ?? NSError(domain: "ComposerAudioRecording", code: 2)
      } else {
        tail.frameLength = min(tail.frameLength, AVAudioFrameCount(max(0, 16_000 * 300 - frames)))
        do {
          try file.write(from: tail)
          frames += AVAudioFramePosition(tail.frameLength)
        } catch { failure = error }
      }
    }
    file = nil
    if let failure { throw failure }
    guard frames > 0 else { throw NSError(domain: "ComposerAudioRecording", code: 3) }
    return Double(frames) / 16
  }

  func discard() {
    lock.lock()
    file = nil
    lock.unlock()
    try? FileManager.default.removeItem(at: url)
  }
}
