import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { SwUpdate } from '@angular/service-worker';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../../core/auth.store';
import { NAV } from '../nav';

const ROLE_LABEL = {
  tutor: 'Korepetytor',
  student: 'Uczeń',
  parent: 'Rodzic',
  admin: 'Administrator',
} as const;

@Component({
  selector: 'pl-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatToolbarModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export default class Shell {
  private readonly store = inject(AuthStore);

  readonly me = this.store.me;
  readonly nav = computed(() => {
    const role = this.store.role();
    return role ? NAV[role] : [];
  });
  readonly roleLabel = computed(() => {
    const role = this.store.role();
    return role ? ROLE_LABEL[role] : '';
  });
  readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 840px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
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

  logout() {
    void this.store.logout();
  }
}
