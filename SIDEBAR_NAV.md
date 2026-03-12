# Sidebar & Navigation

## Changing nav labels and icons

**Labels:** Edit `src/i18n/translations.ts` – add or update keys under `nav.*` for both `en` and `sk` locales.

**Icons:** Edit `src/components/layout/Sidebar.tsx` – the `NAV_ITEMS` array uses Lucide icons. Import from `lucide-react` and assign to the `icon` property.

## Adding a new route

1. **Create the page:** Add `src/app/(app)/app/your-route/page.tsx` (or `src/app/(app)/your-route/page.tsx` for top-level routes).

2. **Add to sidebar:** In `src/components/layout/Sidebar.tsx`, add an entry to `NAV_ITEMS`:
   ```ts
   { href: "/app/your-route", labelKey: "nav.yourRoute", icon: YourIcon },
   ```
   Use `requireTeamAdmin: true` if the item should only show for team workspaces when the user is admin.

3. **Add translation:** In `src/i18n/translations.ts`, add `"nav.yourRoute": "Your Label"` for both locales.

4. **Add header title (optional):** In `src/components/layout/Header.tsx`, add the path to `PAGE_TITLES` if you want a custom header title.

## Conditional visibility (Members, Billing)

Members and Billing are shown only when:
- `activeWorkspace.type === "team"`
- `memberRole === "admin"`

This is controlled by `requireTeamAdmin: true` in `NAV_ITEMS` and the `useWorkspace()` hook in `Sidebar.tsx`.
