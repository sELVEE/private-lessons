import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
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

  logout() {
    void this.store.logout();
  }
}
