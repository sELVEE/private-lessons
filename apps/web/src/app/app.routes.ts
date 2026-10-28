import type { Routes } from '@angular/router';
import { authGuard, guestGuard, roleMatch } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: '',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Logowanie',
        loadComponent: () => import('./features/auth/login-page'),
      },
      {
        path: 'register',
        title: 'Rejestracja',
        loadComponent: () => import('./features/auth/register-page'),
      },
      {
        path: 'forgot-password',
        title: 'Nie pamiętam hasła',
        loadComponent: () => import('./features/auth/forgot-password-page'),
      },
    ],
  },
  // Links from e-mails work whether or not someone is logged in.
  {
    path: 'verify-email',
    title: 'Potwierdzenie e-mail',
    loadComponent: () => import('./features/auth/verify-email-page'),
  },
  {
    path: 'reset-password',
    title: 'Nowe hasło',
    loadComponent: () => import('./features/auth/reset-password-page'),
  },
  {
    path: 'parent-consent',
    title: 'Zgoda rodzica',
    loadComponent: () => import('./features/auth/parent-consent-page'),
  },
  {
    path: 'not-me',
    title: 'Zablokuj konto',
    loadComponent: () => import('./features/auth/not-me-page'),
  },
  {
    path: 'join',
    title: 'Zaproszenie',
    loadComponent: () => import('./features/join/join-landing-page'),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell'),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Pulpit',
        loadComponent: () => import('./features/home/home-page'),
      },
      {
        path: 'account',
        title: 'Konto i bezpieczeństwo',
        loadComponent: () => import('./features/account/security-page'),
      },
      {
        path: 'students',
        title: 'Uczniowie',
        canMatch: [roleMatch('tutor')],
        loadComponent: () => import('./features/students/students-page'),
      },
      {
        path: 'students/:id',
        title: 'Uczeń',
        canMatch: [roleMatch('tutor')],
        loadComponent: () => import('./features/students/enrollment-detail-page'),
      },
      {
        path: 'cooperation/:id',
        title: 'Współpraca',
        canMatch: [roleMatch('student', 'parent')],
        loadComponent: () => import('./features/students/enrollment-detail-page'),
      },
      {
        path: 'subjects',
        title: 'Przedmioty',
        canMatch: [roleMatch('tutor')],
        loadComponent: () => import('./features/subjects/subjects-page'),
      },
      {
        path: 'join',
        title: 'Dołącz do korepetytora',
        canMatch: [roleMatch('student')],
        loadComponent: () => import('./features/join/join-page'),
      },
      {
        path: 'children',
        title: 'Dzieci',
        canMatch: [roleMatch('parent')],
        loadComponent: () => import('./features/children/children-page'),
      },
      {
        path: 'admin',
        title: 'Administracja',
        canMatch: [roleMatch('admin')],
        loadComponent: () => import('./features/admin/admin-page'),
      },
      // Later stages — placeholders until each module lands (see docs/PLAN.md).
      ...placeholder('calendar', 'Kalendarz', 3, 'tutor', 'student', 'parent'),
      ...placeholder('billing', 'Rozliczenia', 5, 'tutor', 'parent'),
      ...placeholder('homework', 'Zadania domowe', 6, 'tutor', 'student'),
      ...placeholder('materials', 'Materiały', 6, 'tutor', 'student'),
      ...placeholder('progress', 'Postępy', 7, 'tutor', 'student', 'parent'),
    ],
  },
  { path: '**', title: 'Nie znaleziono', loadComponent: () => import('./features/not-found-page') },
];

function placeholder(path: string, title: string, stage: number, ...roles: string[]): Routes {
  return [
    {
      path,
      title,
      canMatch: [roleMatch(...roles)],
      data: { stage },
      loadComponent: () => import('./features/coming-soon-page'),
    },
  ];
}
