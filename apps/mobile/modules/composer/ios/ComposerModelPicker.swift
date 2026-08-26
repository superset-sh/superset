import SwiftUI

/// The model picker in the expanded toolbar: the selected agent's brand mark
/// and name, with a chevron.
///
/// Reports a press rather than presenting a `Menu` of its own. The real
/// pickers are already `formSheet` routes carrying searchable lists — branches
/// come back 50 at a time — and a menu cannot search. Keeping presentation in
/// React Native also means the composer never has to hold those lists.
struct ComposerModelPicker: View {
  let selected: ComposerMenuOption?
  let onPress: () -> Void

  var body: some View {
    // Nothing at all without a selection. The terminal surface has no agent to
    // pick, and an empty label still drew its chevron — an orphan control in
    // the corner of the card, pointing at a menu that does not exist.
    if let selected {
      Button(action: onPress) {
        HStack(spacing: 4) {
          if selected.hasIcon {
            ComposerOptionIcon(option: selected)
              .padding(.trailing, 2)
          }
          Text(selected.label)
            .font(.system(size: ComposerMetrics.chromeFontSize))
            .foregroundStyle(.primary)
          Image(systemName: "chevron.down")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.secondary)
        }
        .lineLimit(1)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Model: \(selected.label)")
    }
  }
}
