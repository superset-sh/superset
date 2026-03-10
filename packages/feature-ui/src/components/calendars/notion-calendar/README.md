# Notion Calendar UI Components

Notion 스타일의 고급 캘린더 UI 컴포넌트 라이브러리입니다. 이 패키지는 상태를 가지지 않는(Stateless) 프레젠테이션(Presentational) 컴포넌트로 구성되어 있으며, 외부에서 주입되는 데이터와 이벤트 핸들러를 통해 동작합니다.

## ✨ 1. 주요 기능 (Features)

- **디자인 시스템 일치**: 노션 캘린더 특유의 타이포그래피, 여백, 선 색상, 다크 모드 팝오버 등 미세한 UI 디테일을 완벽하게 재현.
- **세계시간 (World Clock)**: 헤더와 타임라인에 여러 시간대를 동시에 렌더링. `+` 버튼을 통해 팝오버에서 동적으로 시간대 추가/변경/삭제 가능.
- **이벤트 렌더링**: 일별 이벤트 배치 및 시간대별 높이 자동 계산 지원.
- **반응형 컨테이너**: 사이드바(미니 캘린더, 내 캘린더 등)와 메인 뷰(헤더 + 시간표) 간의 레이아웃 분리.
- **인터랙션 준비 완료**: 스크롤 동기화, 시간대 동적 오프셋 적용, 빈 슬롯 클릭, 드래그 상태 관리 등 앱 레벨 확장을 위한 기반 제공.

---

## 🏗 2. 컴포넌트 구조 (Architecture)

시스템은 조립 가능한 여러 하위 컴포넌트로 나뉘어져 있습니다.

```tsx
<NotionCalendar>                 // 전체 래퍼 (h-screen, overflow-hidden)
  <NotionCalendarSidebar>        // 좌측 고정 패널 (너비 설정 가능)
    <NotionCalendarMini />       // 월간 내비게이션 미니 달력
    <NotionCalendarEventGroup /> // 캘린더 표시/숨김 토글 리스트
  </NotionCalendarSidebar>

  <NotionCalendarMain>           // 우측 메인 뷰포트 (수평/수직 스크롤)
    <NotionCalendarHeader />     // 상단 날짜 및 세계시간 헤더 (Sticky Top)
    <NotionCalendarTimeline />   // 메인 시간대 그리드 및 이벤트 블록 (Sticky Left)
  </NotionCalendarMain>
</NotionCalendar>
```

---

## 📖 3. 컴포넌트별 상세 스펙 및 이벤트 (API & Events)

### 3.1 `NotionCalendarMini`
사이드바에 위치하는 작은 월간 달력입니다.
- **Props**
  - `currentMonthText` (`string`): 상단에 표시될 연/월 (예: "2026 2월")
  - `days`: 달력에 렌더링할 날짜 배열 (`date`, `isCurrentMonth`, `isToday`, `fullDate` 등 포함)
  - `visibleDates` (`Set<string>`): 현재 메인 뷰에 보여지는 날짜 영역(하이라이트 처리용)
- **Events**
  - `onPrevMonth()` / `onNextMonth()`: 월 이동 화살표 클릭 시 발생
  - `onDayClick(date: Date)`: 특정 날짜 클릭 시 발생 (메인 뷰 이동용)

### 3.2 `NotionCalendarEventGroup`
내 캘린더, 팀 캘린더 등 캘린더 그룹과 목록을 표시하는 아코디언 컴포넌트입니다.
- **Props**
  - `title` (`string`): 그룹 이름 (예: "내 캘린더")
  - `isExpanded` (`boolean`): 확장/접힘 상태
  - `calendars`: 캘린더 목록 (`id`, `name`, `color`, `isVisible`, `isDefault` 포함)
- **Events**
  - `onToggleExpand()`: 그룹 제목을 클릭하여 열고 닫을 때 발생
  - `onToggleVisibility(id: string)`: 특정 캘린더 좌측의 체크박스(컬러 박스) 클릭 시 발생

### 3.3 `NotionCalendarHeader`
메인 화면 상단에 고정되는 날짜 및 세계시간 헤더입니다.
- **Props**
  - `days`: 화면에 그릴 날짜 열 배열 (`date`, `dayOfWeek`, `dayNumber`, `isToday`, `isHoliday` 등)
  - `timezones`: 세계시간 배열 (`label`: 표기명, `offset`: 기준 시간대 대비 상대 시차)
- **Events**
  - `onAddTimezone(tz: TimezoneInfo)`: 좌측 로케일 영역의 `+` 버튼을 눌러 새 시간대를 추가할 때 발생
  - `onChangeTimezone(index: number, tz: TimezoneInfo)`: 기존 시간대 라벨을 클릭하여 변경할 때 발생
  - `onRemoveTimezone(index: number)`: 서브 시간대에 호버 시 나타나는 `X` 버튼 클릭 시 발생

### 3.4 `NotionCalendarTimeline`
메인 시간표 영역으로, 배경 그리드와 실제 이벤트를 렌더링합니다.
- **Props**
  - `events`: 렌더링할 이벤트 배열 (`startTime`, `endTime`, `date`, `color`, `title` 등)
  - `timezones`: 헤더와 동일한 시간대 배열 (기준 시간에 `offset`을 더해 동적으로 렌더링)
  - `currentTime`: 현재 시간 표시줄(빨간 선) 위치용
  - `extraTzWidth`: 헤더의 `+` 버튼 영역 너비 보정용 (보통 24px)
- **Events (현재 지원)**
  - `onEmptySlotClick(date: string, time: string, e)`: 빈 시간표 슬롯(30분/1시간 단위)을 클릭했을 때 발생 (이벤트 생성용)
  - `onEmptySlotDoubleClick(date: string, hour: number)`: 빈 슬롯을 더블 클릭 했을 때 발생
  - `onEventChange(event: TimelineEvent)`: 이벤트 블록을 드래그하여 위치(시간/날짜)를 이동하거나, 높이를 조절(시간 연장)하여 마우스를 놓았을 때 최종 업데이트 정보 전달.
  - `renderEvent`: 개별 이벤트 UI를 커스텀할 수 있는 렌더 프롭
  - `renderSlotOverlay`: 빈 시간표 슬롯 클릭 시 팝오버/스켈레톤 등을 임시로 렌더링하기 위한 오버레이 렌더 프롭

---

## 🛠 4. 향후 확장 예정 파트 (Future Extensibility)

현재 컴포넌트는 프레젠테이션 계층에 완벽하게 집중되어 있습니다. 완벽한 캘린더 앱 생성을 위해 다음과 같은 이벤트 및 기능 추가가 설계/계획되어 있습니다:

- **이벤트 클릭 (`onEventClick`)**: 생성된 이벤트 카드 클릭 시 상세 뷰 팝업 띄우기
- **드래그-투-크리에이트 (`onEventCreateDrag`)**: 시간표를 상하로 드래그하여 임의의 길이(예: 1시간 45분)의 이벤트를 한 번에 생성
- **콜리전 시스템 고도화**: 동일한 시간대에 여러 이벤트가 겹칠 경우, 가로 너비를 n등분하여 겹치지 않게 표시해주는 레이아웃 알고리즘 구현
- **종일 이벤트 (All-day Events) 렌더링**: 헤더와 타임라인 상단 사이에 종일 이벤트용 섹션 분리

이 모든 기능은 프레젠테이션 컴포넌트(현 UI 패키지)에 Prop을 추가하고, 앱 레벨(`apps/` 폴더 내)에서 상태로 제어하도록 구현될 것입니다.
