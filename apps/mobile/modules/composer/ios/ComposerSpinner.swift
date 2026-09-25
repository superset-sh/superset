import SwiftUI

/// The stock activity indicator, sized to the reference.
///
/// An earlier pass drew a rotating `arrow.clockwise`, on the theory that the
/// button should keep its own identity while it is busy. The reference does the
/// opposite: it uses the system spinner, which is also the thing people read as
/// "working" without having to think about it.
///
/// Measured off the reference button — the spokes span about 39% of the circle,
/// so a 32pt control wants a ~12.5pt indicator. `.mini` is the only stock size
/// in that range; the regular one is nearly two thirds of the button.
struct ComposerSpinner: View {
  var body: some View {
    ProgressView()
      .progressViewStyle(.circular)
      .controlSize(.mini)
      // `ProgressView` takes its colour from the tint, not from the enclosing
      // `foregroundStyle`, so the button style cannot set this for it.
      .tint(.white.opacity(0.45))
  }
}
