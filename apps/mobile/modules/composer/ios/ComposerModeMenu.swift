import ExpoModulesCore
import SwiftUI
import UIKit

struct ComposerModeOption: Record, Identifiable, Equatable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var symbol: String = "slider.horizontal.3"

  static func == (lhs: ComposerModeOption, rhs: ComposerModeOption) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.symbol == rhs.symbol
  }
}

/// The agent's permission mode beside `+`. A native menu rather than a press
/// reported to React Native, so the list opens anchored to the control with the
/// current mode checked.
struct ComposerModeMenu: View {
  let options: [ComposerModeOption]
  let selectedId: String?
  let onSelect: (String) -> Void

  private var selected: ComposerModeOption? {
    options.first { $0.id == selectedId }
  }

  private var selection: Binding<String?> {
    Binding(
      get: { selectedId },
      set: { id in
        guard let id, id != selectedId else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        onSelect(id)
      }
    )
  }

  var body: some View {
    Menu {
      Picker(selection: selection) {
        ForEach(options) { option in
          Label(option.label, systemImage: option.symbol).tag(Optional(option.id))
        }
      } label: {
        EmptyView()
      }
      .pickerStyle(.inline)
    } label: {
      Image(systemName: selected?.symbol ?? "slider.horizontal.3")
        .font(.system(size: 19, weight: .regular))
    }
    .menuStyle(.button)
    .buttonStyle(.composerControl)
    .accessibilityLabel(selected?.label ?? options.first?.label ?? "")
  }
}
