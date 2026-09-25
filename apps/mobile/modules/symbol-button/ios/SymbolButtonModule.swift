import ExpoModulesCore
import UIKit

/// One row of the anchored menu. `id` is what comes back on selection.
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

/// A button whose whole content is an SF Symbol. Given `items` it presents a
/// `UIMenu` anchored to itself, which only UIKit can do: a menu is presented
/// outside the React Native view tree, so a view drawn in JS would clip to its
/// parent and would have to imitate the material, the animation and the
/// VoiceOver semantics by hand.
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
    // The menu is the tap, not a long press, so a single tap opens it.
    button.showsMenuAsPrimaryAction = true
  }

  @objc private func handleTap() {
    // With a menu attached UIKit presents it and this never fires, so a plain
    // press only reaches JS when the button has no items.
    guard items.isEmpty else { return }
    onTap()
  }

  private func applySymbol() {
    let config = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .regular)
    button.setImage(UIImage(systemName: symbolName, withConfiguration: config), for: .normal)
  }
}
