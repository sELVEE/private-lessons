import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { AuthStore } from '../../core/auth.store';
import { NAV } from '../nav';

const COLLAPSED_KEY = 'pl.nav.collapsed';

const ROLE_LABEL = {
  tutor: 'Korepetytor',
  student: 'Uczeń',
  parent: 'Rodzic',
  admin: 'Administrator',
} as const;

/**
 * Layout per Material 3 navigation guidance: side navigation (collapsible to icons) on wide screens,
 * icons only on medium ones, a bottom navigation bar on phones.
 */
@Component({
  selector: 'pl-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export default class Shell {
  private readonly store = inject(AuthStore);

  readonly me = this.store.me;
  readonly nav = computed(() => {
    const role = this.store.role();
    return role ? NAV[role] : { dock: [], more: [] };
  });
  /** Every destination: the side navigation has room for all of them. */
  readonly all = computed(() => [...this.nav().dock, ...this.nav().more]);
  readonly roleLabel = computed(() => {
    const role = this.store.role();
    return role ? ROLE_LABEL[role] : '';
  });
  readonly initial = computed(() => this.me()?.displayName.charAt(0).toUpperCase() ?? '?');
  readonly today = new Date().toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  /** The user's choice on wide screens (remembered in this browser). */
  readonly userCollapsed = signal(readCollapsed());
  /** Medium windows (rail): always icons only. */
  readonly medium = signal(false);
  readonly collapsed = computed(() => this.userCollapsed() || this.medium());
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    const mq = matchMedia('(min-width: 600px) and (max-width: 1199.98px)');
    const onMq = () => this.medium.set(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onMq));

    const set = () => this.online.set(navigator.onLine);
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    });

    // New app version downloaded by the service worker: offer a reload.
    const updates = inject(SwUpdate);
    const snack = inject(MatSnackBar);
    if (updates.isEnabled) {
      updates.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => {
        snack
          .open('Dostępna jest nowa wersja aplikacji', 'Odśwież')
          .onAction()
          .subscribe(() => document.location.reload());
      });
    }
  }

  toggleCollapsed() {
    // On medium windows the rail is always compact; the toggle then has nothing to change.
    if (this.medium()) return;
    const next = !this.userCollapsed();
    this.userCollapsed.set(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  }

  logout() {
    void this.store.logout();
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
