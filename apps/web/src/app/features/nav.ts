import type { AccountType } from '@pl/shared';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface RoleNav {
  /** Up to five main destinations — the bottom navigation bar on phones. */
  dock: NavItem[];
  /** Less frequent destinations — in the side navigation, behind „Więcej” on phones. */
  more: NavItem[];
}

const NOW: NavItem = { path: '/app', label: 'Teraz', icon: 'radio_button_checked' };

/** Role-specific navigation. Hiding items is cosmetic — the API checks permissions on every request. */
export const NAV: Record<AccountType | 'admin', RoleNav> = {
  tutor: {
    dock: [
      NOW,
      { path: '/app/calendar', label: 'Kalendarz', icon: 'calendar_month' },
      { path: '/app/students', label: 'Uczniowie', icon: 'groups' },
      { path: '/app/homework', label: 'Zadania', icon: 'assignment' },
      { path: '/app/billing', label: 'Pieniądze', icon: 'payments' },
    ],
    more: [
      { path: '/app/materials', label: 'Materiały', icon: 'library_books' },
      { path: '/app/progress', label: 'Postępy', icon: 'trending_up' },
      { path: '/app/subjects', label: 'Przedmioty i tematy', icon: 'category' },
    ],
  },
  student: {
    dock: [
      NOW,
      { path: '/app/calendar', label: 'Lekcje', icon: 'calendar_month' },
      { path: '/app/homework', label: 'Zadania', icon: 'assignment' },
      { path: '/app/materials', label: 'Materiały', icon: 'library_books' },
      { path: '/app/progress', label: 'Postępy', icon: 'trending_up' },
    ],
    more: [{ path: '/app/billing', label: 'Płatności', icon: 'payments' }],
  },
  parent: {
    dock: [
      NOW,
      { path: '/app/children', label: 'Dzieci', icon: 'family_restroom' },
      { path: '/app/calendar', label: 'Lekcje', icon: 'calendar_month' },
      { path: '/app/progress', label: 'Postępy', icon: 'trending_up' },
      { path: '/app/billing', label: 'Płatności', icon: 'payments' },
    ],
    more: [{ path: '/app/homework', label: 'Zadania domowe', icon: 'assignment' }],
  },
  admin: {
    dock: [NOW, { path: '/app/admin', label: 'Administracja', icon: 'admin_panel_settings' }],
    more: [],
  },
};
