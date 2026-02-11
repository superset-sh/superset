import ExpoModulesCore

public final class TabBarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabBar")
    View(TabBarView.self)
  }
}
