import SwiftUI

/// Mirrors `useVoiceDictation`'s discriminated union. The state machine stays in
/// React Native — it owns the recognizer, the permission prompt and the append
/// semantics, and it is already proven — so the composer only renders the state
/// and reports the two presses that drive it.
enum ComposerVoiceState: String {
  case idle
  case recording
  case finalizing
}

/// The recording pill: stop square, elapsed time, and a level meter.
///
/// The clock is `Text(timerInterval:)`, which iOS redraws itself — no `Timer`,
/// no per-second state change, and no re-render of the composer around it. The
/// previous implementation ticked a `@State` date every second purely to redraw
/// this one label.
struct ComposerVoicePill: View {
  let startedAt: Date
  let level: Double
  let onStop: () -> Void

  var body: some View {
    Button(action: onStop) {
      HStack(spacing: 8) {
        Image(systemName: "stop.fill")
          .font(.system(size: 11))
        Text(
          timerInterval: startedAt...startedAt.addingTimeInterval(60 * 60),
          countsDown: false,
          showsHours: false
        )
        .font(.system(size: 14).monospacedDigit())
        .fixedSize()
        ComposerLevelMeter(level: level)
      }
      .foregroundStyle(.primary)
      .padding(.horizontal, 12)
      .frame(height: ComposerMetrics.controlDiameter)
      .background(.white.opacity(0.12), in: .capsule)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Stop dictation")
  }
}

/// Five dots that swell with the recognizer's volume. Each is offset along the
/// run so the row reads as a meter rather than five things blinking together.
private struct ComposerLevelMeter: View {
  let level: Double

  private static let count = 5

  var body: some View {
    HStack(spacing: 3) {
      ForEach(0..<Self.count, id: \.self) { index in
        let threshold = Double(index) / Double(Self.count)
        let lit = max(0, min(1, (level - threshold) * Double(Self.count)))
        Circle()
          .fill(.primary)
          .frame(width: 4, height: 4)
          .opacity(0.3 + 0.7 * lit)
          .scaleEffect(1 + 0.35 * lit)
      }
    }
    .animation(.easeOut(duration: 0.12), value: level)
    .accessibilityHidden(true)
  }
}
