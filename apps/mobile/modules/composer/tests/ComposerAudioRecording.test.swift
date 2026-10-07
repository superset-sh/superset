import AVFoundation
import Foundation

@main
struct ComposerAudioRecordingTests {
  static func main() {
    do { try run() } catch {
      fputs("Audio route-change regression failed: \(error)\n", stderr)
      exit(1)
    }
  }

  static func run() throws {
    let initial = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: 48_000,
      channels: 1, interleaved: false
    )!
    let recording = try ComposerAudioRecording(format: initial)
    defer { recording.discard() }
    for (rate, channels) in [(48_000.0, 1), (16_000.0, 2), (8_000.0, 1)] {
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: rate,
        channels: AVAudioChannelCount(channels), interleaved: false
      )!
      var remaining = Int(rate)
      while remaining > 0 {
        let count = min(1024, remaining)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
        buffer.frameLength = buffer.frameCapacity
        for channel in 0..<channels {
          buffer.floatChannelData![channel].initialize(repeating: 0, count: count)
        }
        recording.append(buffer)
        remaining -= count
      }
    }
    let duration = try recording.finish()
    guard duration > 2900 && duration <= 3000 else {
      throw NSError(domain: "ComposerAudioRecordingTests", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Expected three seconds across route changes, got \(duration)"])
    }
    let file = try AVAudioFile(forReading: recording.url)
    guard file.processingFormat.sampleRate == 16_000,
      file.processingFormat.channelCount == 1 else {
      throw NSError(domain: "ComposerAudioRecordingTests", code: 2)
    }
    print("Audio route-change regression passed")
  }
}
