import SwiftUI

/// The send button's in-flight state: a refresh glyph turning under its own
/// steam. A `ProgressView` would read as the system's spinner rather than as
/// this button continuing to be the same control.
struct ComposerSpinner: View {
  @State private var turning = false

  var body: some View {
    Image(systemName: "arrow.clockwise")
      .font(.system(size: 15, weight: .semibold))
      .rotationEffect(.degrees(turning ? 360 : 0))
      .animation(
        .linear(duration: 0.9).repeatForever(autoreverses: false),
        value: turning
      )
      .onAppear { turning = true }
  }
}
