import type { AccountType } from '@pl/shared';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const COMMON_END: NavItem[] = [{ path: '/app/account', label: 'Konto', icon: 'manage_accounts' }];
const HOME: NavItem = { path: '/app', label: 'Pulpit', icon: 'dashboard' };

/** Role-specific menus. Hiding items is cosmetic — the API checks permissions on every request. */
export const NAV: Record<AccountType | 'admin', NavItem[]> = {
  tutor: [
    HOME,
    { path: '/app/calendar', label: 'Kalendarz', icon: 'calendar_month' },
    { path: '/app/students', label: 'Uczniowie', icon: 'groups' },
    { path: '/app/subjects', label: 'Przedmioty', icon: 'category' },
    { path: '/app/billing', label: 'Rozliczenia', icon: 'payments' },
    { path: '/app/materials', label: 'Materiały', icon: 'library_books' },
    { path: '/app/homework', label: 'Zadania domowe', icon: 'assignment' },
    { path: '/app/progress', label: 'Postępy', icon: 'trending_up' },
    ...COMMON_END,
  ],
  student: [
    HOME,
    { path: '/app/calendar', label: 'Moje lekcje', icon: 'calendar_month' },
    { path: '/app/homework', label: 'Zadania domowe', icon: 'assignment' },
    { path: '/app/materials', label: 'Materiały', icon: 'library_books' },
    { path: '/app/progress', label: 'Moje postępy', icon: 'trending_up' },
    ...COMMON_END,
  ],
  parent: [
    HOME,
    { path: '/app/children', label: 'Dzieci', icon: 'family_restroom' },
    { path: '/app/calendar', label: 'Lekcje', icon: 'calendar_month' },
    { path: '/app/progress', label: 'Postępy', icon: 'trending_up' },
    { path: '/app/billing', label: 'Płatności', icon: 'payments' },
    ...COMMON_END,
  ],
  admin: [
    HOME,
    { path: '/app/admin', label: 'Administracja', icon: 'admin_panel_settings' },
    ...COMMON_END,
  ],
};
