import Accelerate
import AVFoundation
import SwiftUI
import Observation
import Speech

/// Dictation, run entirely on this side of the bridge.
///
/// This began as a prop mirror of React Native's `useVoiceDictation`. The level
/// meter is what settled it: the recogniser's volume had to cross the bridge
/// about ten times a second, for the whole recording, purely to animate five
/// dots — precisely the chatty seam this rewrite exists to remove. And
/// `expo-speech-recognition` is itself a wrapper over `SFSpeechRecognizer`, so
/// owning it here is less indirection rather than more.
///
/// The behaviours below are carried over deliberately from that hook; they were
/// each learned the hard way and none of them are obvious:
///
/// - **Continuous, final results only.** Interim results arrive constantly and
///   would rewrite the draft mid-sentence.
/// - **A finalize backstop.** Stopping asks the recogniser to flush; if it never
///   answers, the composer would sit in `finalizing` forever.
/// - **The recogniser's own task end is authoritative.** No result can follow
///   it, in any state.
/// - **Append, never replace**, so dictating after typing adds to what is there.
/// - **Permission refusal settles to idle** with the prior text intact.
@Observable
final class ComposerDictation {
  enum State: Equatable {
    case idle
    /// Pressed, but the recogniser is not live yet — authorization and the
    /// audio session are both async. A state of its own rather than a gap in
    /// `idle`, because the composer has to know dictation has begun from the
    /// instant of the press: starting the audio session costs it first
    /// responder, and without this the composer reads that as the user
    /// dismissing it and closes underneath the recording.
    case preparing
    case recording(startedAt: Date)
    case finalizing
  }

  private(set) var state: State = .idle

  /// The last few loudness samples, oldest first, each 0–1.
  ///
  /// A history rather than one number, because the meter is a waveform that
  /// scrolls: each sample keeps its own bar and the row shifts left as new ones
  /// arrive. A single level would give five bars that all rise and fall
  /// together, which reads as blinking rather than as sound.
  private(set) var levels = [Double](repeating: 0, count: ComposerDictation.meterSamples)

  static let meterSamples = 5

  /// Receives the final transcript. The composer appends it to its own draft.
  @ObservationIgnored var onTranscript: ((String) -> Void)?
  @ObservationIgnored var onError: ((String) -> Void)?

  @ObservationIgnored private let engine = AVAudioEngine()
  @ObservationIgnored private let recognizer = SFSpeechRecognizer()
  @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
  @ObservationIgnored private var task: SFSpeechRecognitionTask?
  @ObservationIgnored private var transcript = ""
  @ObservationIgnored private var backstop: Task<Void, Never>?
  /// Touched only from the audio tap thread, between publishes.
  @ObservationIgnored private var pendingFrames = 0.0
  @ObservationIgnored private var pendingPeak = 0.0

  /// Matches the hook's 15s: long enough for a slow flush, short enough that a
  /// recogniser that never answers does not wedge the composer.
  private static let finalizeTimeout = Duration.seconds(15)

  /// One bar every 100ms, so the five of them span half a second of speech.
  /// Timed off the audio clock — the number of frames actually delivered —
  /// rather than a `Timer`, so the meter cannot drift away from the sound.
  private static let meterInterval = 0.1

  var isActive: Bool { state != .idle }

  /// Every transition opens a transaction. The pill and the mic share the
  /// composer's trailing slot, so a state change relays out the control row —
  /// and the row deliberately has no animation of its own, because a second
  /// curve there sends the control along an arc. See `ComposerRootView`.
  @MainActor
  private func setState(_ next: State) {
    withAnimation(ComposerMetrics.controlSwap) { state = next }
  }

  // MARK: - Control

  @MainActor
  func start() {
    guard case .idle = state else { return }
    setState(.preparing)
    Task { @MainActor in
      guard await requestAuthorization() else {
        settle(with: nil)
        onError?("Microphone access is not allowed")
        return
      }
      do {
        try beginRecording()
      } catch {
        settle(with: nil)
        onError?("Could not start dictation")
      }
    }
  }

  @MainActor
  func stop() {
    guard case .recording = state else { return }
    setState(.finalizing)
    // Let the recogniser flush what it has; `task` reports the final result.
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    request?.endAudio()
    armBackstop()
  }

  // MARK: - Internals

  @MainActor
  private func requestAuthorization() async -> Bool {
    let speech = await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
    }
    guard speech == .authorized else { return false }
    return await withCheckedContinuation { continuation in
      AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
    }
  }

  @MainActor
  private func beginRecording() throws {
    guard let recognizer, recognizer.isAvailable else {
      throw NSError(domain: "ComposerDictation", code: 1)
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetooth]
    )
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let request = SFSpeechAudioBufferRecognitionRequest()
    // Interim results would rewrite the draft mid-sentence.
    request.shouldReportPartialResults = false
    self.request = request
    transcript = ""

    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    // `installTap` raises an Objective-C exception — not a Swift error, so
    // there is nothing to catch — when handed a degenerate format, which is
    // what the input node reports while something else holds the microphone: a
    // phone call, another recording app. Checking first turns a crash into the
    // ordinary failure path.
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "ComposerDictation", code: 2)
    }
    pendingFrames = 0
    pendingPeak = 0
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      request.append(buffer)
      self?.accumulate(buffer, sampleRate: format.sampleRate)
    }

    engine.prepare()
    try engine.start()

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result, result.isFinal {
        self.transcript = result.bestTranscription.formattedString
      }
      // The task ending is authoritative: nothing can follow it.
      if error != nil || result?.isFinal == true {
        Task { @MainActor in self.settle(with: self.transcript) }
      }
    }

    setState(.recording(startedAt: Date()))
  }

  /// Called on the audio thread for every buffer. It folds each one into a
  /// running peak and only crosses to the main actor once per bar, so a 21ms
  /// buffer cadence does not turn into fifty view updates a second.
  private func accumulate(_ buffer: AVAudioPCMBuffer, sampleRate: Double) {
    guard let channel = buffer.floatChannelData?[0], sampleRate > 0 else { return }
    let frames = Int(buffer.frameLength)
    guard frames > 0 else { return }

    var peak: Float = 0
    vDSP_maxmgv(channel, buffer.stride, &peak, vDSP_Length(frames))
    pendingPeak = max(pendingPeak, Double(peak))
    pendingFrames += Double(frames)

    guard pendingFrames / sampleRate >= Self.meterInterval else { return }
    let sample = Self.normalize(pendingPeak)
    pendingFrames = 0
    pendingPeak = 0
    Task { @MainActor in self.push(sample) }
  }

  /// The curve the React Native meter used, kept intact because it is tuned:
  /// peak amplitude in decibels, a -60 dB floor, and a 1.5x gain that puts full
  /// scale at about -20 dB. Speech peaks land well under 0 dBFS, so mapping the
  /// full range would leave the bars flat; the gain is what makes a normal
  /// speaking voice reach the top of the meter.
  ///
  /// Peak rather than RMS on purpose. RMS sits roughly 10-15 dB below peak for
  /// speech, so the same thresholds read as near-silence and the meter has to
  /// be given a much lower floor — which then makes it twitch at room noise.
  private static func normalize(_ peak: Double) -> Double {
    let decibels = 20 * log10(max(peak, 1e-7))
    let normalized = (decibels + 60) / 60
    return min(1, max(0, normalized * 1.5))
  }

  @MainActor
  private func push(_ sample: Double) {
    guard case .recording = state else { return }
    levels.removeFirst()
    levels.append(sample)
  }

  private func armBackstop() {
    backstop?.cancel()
    backstop = Task { [weak self] in
      try? await Task.sleep(for: Self.finalizeTimeout)
      guard !Task.isCancelled else { return }
      await MainActor.run { self?.settle(with: self?.transcript) }
    }
  }

  @MainActor
  private func settle(with text: String?) {
    guard state != .idle else { return }
    backstop?.cancel()
    backstop = nil
    task?.cancel()
    task = nil
    request = nil
    if engine.isRunning {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
    }
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
    setState(.idle)
    levels = [Double](repeating: 0, count: Self.meterSamples)
    pendingFrames = 0
    pendingPeak = 0

    let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty else { return }
    onTranscript?(trimmed)
  }
}
