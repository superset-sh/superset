import SwiftUI
import ExpoModulesCore

struct TabBarView: ExpoSwiftUI.View {
  @ObservedObject var props: TabBarProps
  @State private var isExpanded: Bool = false

  init(props: TabBarProps) {
    self.props = props
  }

  var body: some View {
    ZStack(alignment: .bottom) {
      // Dismiss overlay when expanded
      if isExpanded {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
              isExpanded = false
            }
          }
          .ignoresSafeArea()
      }

      // Main content
      HStack(alignment: .bottom) {
        if isExpanded {
          ExpandedMenuView(
            tabs: props.tabs,
            menuActions: props.menuActions,
            selectedTab: props.selectedTab,
            organizationName: props.organizationName,
            onTabTap: { name in
              props.onTabSelect(["name": name])
              withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                isExpanded = false
              }
            },
            onMenuActionTap: { name in
              props.onMenuActionPress(["name": name])
              withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                isExpanded = false
              }
            },
            onSettingsTap: {
              props.onSettingsPress()
              withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                isExpanded = false
              }
            },
            onOrgTap: {
              props.onOrgPress()
              withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                isExpanded = false
              }
            }
          )
          .transition(
            .scale(scale: 0.9, anchor: .bottomLeading)
            .combined(with: .opacity)
          )
        } else {
          CollapsedBarView(
            tabs: props.tabs,
            selectedTab: props.selectedTab,
            onTabTap: { name in
              props.onTabSelect(["name": name])
            },
            onMenuTriggerTap: {
              withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                isExpanded = true
              }
            }
          )
          .transition(
            .scale(scale: 0.9, anchor: .bottomLeading)
            .combined(with: .opacity)
          )
        }

        Spacer()

        // Search button - always visible
        GlassCircleButton(icon: "magnifyingglass") {
          props.onSearchPress()
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 8)
    }
    .onChange(of: isExpanded) { newValue in
      props.onExpandedChange(["expanded": newValue])
    }
  }
}
