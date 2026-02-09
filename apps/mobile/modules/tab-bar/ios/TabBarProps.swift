import ExpoModulesCore

struct TabItem: Record {
  @Field var name: String = ""
  @Field var icon: String = ""
  @Field var label: String = ""
  @Field var badge: Int?
  @Field var isMenuTrigger: Bool = false
}

struct MenuAction: Record {
  @Field var name: String = ""
  @Field var icon: String = ""
  @Field var label: String = ""
}

final class TabBarProps: ExpoSwiftUI.ViewProps {
  @Field var tabs: [TabItem] = []
  @Field var menuActions: [MenuAction] = []
  @Field var selectedTab: String = ""
  @Field var organizationName: String = ""
  var onTabSelect = EventDispatcher()
  var onMenuActionPress = EventDispatcher()
  var onSettingsPress = EventDispatcher()
  var onSearchPress = EventDispatcher()
  var onOrgPress = EventDispatcher()
  var onExpandedChange = EventDispatcher()
}
