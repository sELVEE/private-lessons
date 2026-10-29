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
      {
        path: 'lessons/:id',
        title: 'Lekcja',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/lessons/lesson-page'),
      },
      {
        path: 'calendar',
        title: 'Kalendarz',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/calendar/calendar-page'),
      },
      {
        path: 'billing',
        title: 'Rozliczenia',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/billing/billing-page'),
      },
      {
        path: 'billing/:id',
        title: 'Rozliczenie',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/billing/billing-account-page'),
      },
      {
        path: 'homework',
        title: 'Zadania domowe',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/homework/homework-page'),
      },
      {
        path: 'materials',
        title: 'Materiały',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/materials/materials-page'),
      },
      {
        path: 'progress',
        title: 'Postępy',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/progress/progress-list-page'),
      },
      {
        path: 'progress/:id',
        title: 'Postępy',
        canMatch: [roleMatch('tutor', 'student', 'parent')],
        loadComponent: () => import('./features/progress/progress-page'),
      },
    ],
  },
  { path: '**', title: 'Nie znaleziono', loadComponent: () => import('./features/not-found-page') },
];
