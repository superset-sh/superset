import SwiftUI

struct ExpandedMenuView: View {
  let tabs: [TabItem]
  let menuActions: [MenuAction]
  let selectedTab: String
  let organizationName: String
  let onTabTap: (String) -> Void
  let onMenuActionTap: (String) -> Void
  let onSettingsTap: () -> Void
  let onOrgTap: () -> Void

  var body: some View {
    VStack(spacing: 12) {
      // Top row: org switcher + settings
      HStack {
        Button(action: onOrgTap) {
          HStack(spacing: 6) {
            Image(systemName: "diamond.fill")
              .font(.system(size: 10))
            Text(organizationName)
              .font(.system(size: 14, weight: .medium))
            Image(systemName: "chevron.up.chevron.down")
              .font(.system(size: 10))
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(.ultraThinMaterial, in: Capsule())
        }
        .buttonStyle(.plain)

        Spacer()

        GlassCircleButton(icon: "gearshape.fill") {
          onSettingsTap()
        }
      }

      // Menu body
      VStack(spacing: 0) {
        ForEach(Array(tabs.filter { !$0.isMenuTrigger }.enumerated()), id: \.element.name) { _, tab in
          Button {
            onTabTap(tab.name)
          } label: {
            HStack(spacing: 12) {
              Image(systemName: tab.icon)
                .font(.system(size: 16, weight: .medium))
                .frame(width: 24)
              Text(tab.label)
                .font(.system(size: 16, weight: .regular))
              Spacer()
              if let badge = tab.badge, badge > 0 {
                Text("\(badge)")
                  .font(.system(size: 12, weight: .semibold))
                  .foregroundStyle(.white.opacity(0.7))
              }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
              tab.name == selectedTab
                ? Color.white.opacity(0.12)
                : Color.clear,
              in: RoundedRectangle(cornerRadius: 8)
            )
          }
          .buttonStyle(.plain)
        }

        if !menuActions.isEmpty {
          Divider()
            .background(Color.white.opacity(0.2))
            .padding(.vertical, 4)

          ForEach(Array(menuActions.enumerated()), id: \.element.name) { _, action in
            Button {
              onMenuActionTap(action.name)
            } label: {
              HStack(spacing: 12) {
                Image(systemName: action.icon)
                  .font(.system(size: 16, weight: .medium))
                  .frame(width: 24)
                Text(action.label)
                  .font(.system(size: 16, weight: .regular))
                Spacer()
              }
              .foregroundStyle(.white)
              .padding(.horizontal, 12)
              .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(8)
      .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
  }
}
