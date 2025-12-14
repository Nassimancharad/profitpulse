# Top Bar and Time Range Controls (Current State)

## Components

- `src/components/AppShell.tsx`
  - Provides the page layout and renders the sticky top bar.
  - Uses `PageTopBar` to render title and right-side controls.
  - Pass `timeControl` for the date range selector and `overflowActions` for the sync button.

- `src/components/PageTopBar.tsx`
  - Minimal header with left-aligned title and right-aligned controls.
  - Accepts `timeControl` (date picker) and `overflowActions` (sync button).

- `src/components/TimeRangeSelector.tsx`
  - Compact pill showing the active range (truncates on small widths).
  - Preset popover: Today, Last 7 days, Last 30 days, Custom range.
  - Custom range opens a modal/bottom sheet with From/To + Apply/Cancel.
  - Updates `start`/`end` query params to keep pages consistent.

- `src/components/OverflowMenu.tsx`
  - Now a dedicated sync button (left of the date picker).
  - Uses the provided refresh icon and shows status text (Sync / Syncing / Synced).
  - Calls `/api/sync?shop=<domain>`; noop if no shop or already loading.

## Usage Patterns

- Pages supply:
  - `timeControl`: `<TimeRangeSelector startDate={...} endDate={...} />`
  - `overflowActions`: `<OverflowMenu shopDomain={...} />`
  - `title`: page title; `subtitle` is optional and often omitted.

- Alignment:
  - Both controls use `h-10`, `rounded-xl`, consistent border/background.
  - Spacing between controls is managed by `PageTopBar` gaps.

## Notes

- The top bar height is controlled in `AppShell` via header padding (`py-6`).
- If adjusting visual weight:
  - Tweak border opacity on `TimeRangeSelector` and `OverflowMenu`.
  - Adjust `gap` in `PageTopBar` if the controls need more/less space.

