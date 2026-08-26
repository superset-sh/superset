import SwiftUI

/// The recording pill: stop square, elapsed time, and a level meter.
///
/// Measured off the reference recording frame rather than guessed: the pill is
/// exactly as tall as the circular controls beside it and sits in the same
/// trailing slot, so starting dictation grows the mic sideways instead of
/// swapping in a differently shaped thing.
///
/// The clock is `Text(timerInterval:)`, which iOS redraws itself — no `Timer`,
/// no per-second state change, and no re-render of the composer around it. The
/// React Native version ticked a `useState` date every second purely to redraw
/// this one label, which re-rendered the whole composer with it.
struct ComposerVoicePill: View {
  let startedAt: Date
  let levels: [Double]
  let onStop: () -> Void

  /// Both measured off the reference pill. The inner spacing is deliberately
  /// tighter than the control row's: `stop.fill`'s glyph box is wider than the
  /// square it draws, so the row's own 8pt reads as 11pt of air beside it.
  private static let innerSpacing: CGFloat = 6
  private static let horizontalPadding: CGFloat = 12

  var body: some View {
    Button(action: onStop) {
      HStack(spacing: Self.innerSpacing) {
        Image(systemName: "stop.fill")
          .font(.system(size: 11))
        Text(
          timerInterval: startedAt...startedAt.addingTimeInterval(60 * 60),
          countsDown: false,
          showsHours: false
        )
        .font(.system(size: 14).monospacedDigit())
        // Without this the label reserves room for the widest time it could
        // ever show, and the pill is born several points too wide.
        .fixedSize()
        ComposerLevelMeter(levels: levels)
      }
      // The reference glyphs are the same light grey as the placeholder, not
      // white — `.primary` reads as louder than everything around it.
      .foregroundStyle(.secondary)
      .padding(.horizontal, Self.horizontalPadding)
      .frame(height: ComposerMetrics.controlDiameter)
      .background(.white.opacity(0.12), in: .capsule)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Stop dictation")
  }
}

/// A scrolling waveform: one bar per loudness sample, oldest on the left.
///
/// The bars grow from the centre outwards rather than up from a baseline,
/// which is both what the reference shows and what keeps the row optically
/// centred in the pill when nothing is being said.
private struct ComposerLevelMeter: View {
  let levels: [Double]

  private static let barWidth: CGFloat = 3
  private static let spacing: CGFloat = 2.5
  /// A resting bar is still a visible mark — silence should read as a quiet
  /// meter, not as a meter that has switched off.
  private static let minHeight: CGFloat = 5
  private static let maxHeight: CGFloat = 14

  var body: some View {
    HStack(spacing: Self.spacing) {
      ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
        Capsule()
          // Set outright rather than taken from the hierarchy: `.tertiary`
          // inside the pill's `.secondary` foreground composes down to about
          // half the contrast the reference bars have against their fill.
          .fill(.white.opacity(0.18))
          .frame(
            width: Self.barWidth,
            height: Self.minHeight + level * (Self.maxHeight - Self.minHeight)
          )
      }
    }
    .frame(height: Self.maxHeight)
    // Matches the sample interval, so each bar has finished moving just as its
    // replacement arrives and the row glides instead of stepping.
    .animation(.linear(duration: 0.1), value: levels)
    .accessibilityHidden(true)
  }
}
