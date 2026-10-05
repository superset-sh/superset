import ExpoModulesCore
import UIKit

struct SymbolMenuItem: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var systemImage: String?
}

public class SymbolButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SymbolButton")

    View(SymbolButtonView.self) {
      Events("onTap", "onSelect")

      Prop("systemImage") { (view: SymbolButtonView, name: String) in
        view.setSymbol(name)
      }

      Prop("size") { (view: SymbolButtonView, size: Double) in
        view.setSymbolSize(CGFloat(size))
      }

      Prop("tint") { (view: SymbolButtonView, color: UIColor?) in
        view.setTint(color)
      }

      Prop("accessibilityLabel") { (view: SymbolButtonView, label: String?) in
        view.button.accessibilityLabel = label
      }

      Prop("enabled") { (view: SymbolButtonView, enabled: Bool) in
        view.button.isEnabled = enabled
      }

      Prop("items") { (view: SymbolButtonView, items: [SymbolMenuItem]?) in
        view.setItems(items ?? [])
      }
    }
  }
}

final class SymbolButtonView: ExpoView {
  let button = UIButton(type: .system)

  private let onTap = EventDispatcher()
  private let onSelect = EventDispatcher()

  private var symbolName = "circle"
  private var symbolSize: CGFloat = 20
  private var items: [SymbolMenuItem] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    button.translatesAutoresizingMaskIntoConstraints = false
    button.addTarget(self, action: #selector(handleTap), for: .touchUpInside)
    addSubview(button)

    isAccessibilityElement = false

    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: leadingAnchor),
      button.trailingAnchor.constraint(equalTo: trailingAnchor),
      button.topAnchor.constraint(equalTo: topAnchor),
      button.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    applySymbol()
  }

  func setSymbol(_ name: String) {
    symbolName = name
    applySymbol()
  }

  func setSymbolSize(_ size: CGFloat) {
    symbolSize = size
    applySymbol()
  }

  func setTint(_ color: UIColor?) {
    button.tintColor = color
  }

  func setItems(_ items: [SymbolMenuItem]) {
    self.items = items
    guard !items.isEmpty else {
      button.menu = nil
      button.showsMenuAsPrimaryAction = false
      return
    }

    let actions = items.map { item in
      UIAction(
        title: item.title,
        image: item.systemImage.flatMap { UIImage(systemName: $0) }
      ) { [weak self] _ in
        self?.onSelect(["id": item.id])
      }
    }

    button.menu = UIMenu(children: actions)
    button.showsMenuAsPrimaryAction = true
  }

  @objc private func handleTap() {
    guard items.isEmpty else { return }
    onTap()
  }

  private func applySymbol() {
    let config = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .regular)
    button.setImage(UIImage(systemName: symbolName, withConfiguration: config), for: .normal)
  }
}
