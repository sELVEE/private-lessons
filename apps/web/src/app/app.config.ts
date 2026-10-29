import { ENTER } from '@angular/cdk/keycodes';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localePl from '@angular/common/locales/pl';
import {
  type ApplicationConfig,
  LOCALE_ID,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  type MatFormFieldDefaultOptions,
} from '@angular/material/form-field';
import { MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS } from '@angular/material/button-toggle';
import { MAT_CHIPS_DEFAULT_OPTIONS } from '@angular/material/chips';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { sessionExpiredInterceptor } from './core/session-expired.interceptor';

registerLocaleData(localePl);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      // Double-submit CSRF: echo the readable pl_csrf cookie in a header on mutating requests.
      withXsrfConfiguration({ cookieName: 'pl_csrf', headerName: 'X-CSRF-Token' }),
      withInterceptors([sessionExpiredInterceptor]),
    ),
    { provide: LOCALE_ID, useValue: 'pl' },
    // Jeden wygląd pól w całej aplikacji; podpowiedzi i błędy zajmują miejsce tylko gdy są.
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        appearance: 'outline',
        subscriptSizing: 'dynamic',
      } satisfies MatFormFieldDefaultOptions,
    },
    // Wybraną opcję pokazuje kolor wypełnienia — bez dodatkowego ✓, który zmienia szerokość przycisku.
    {
      provide: MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS,
      useValue: { hideSingleSelectionIndicator: true },
    },
    {
      provide: MAT_CHIPS_DEFAULT_OPTIONS,
      useValue: { separatorKeyCodes: [ENTER], hideSingleSelectionIndicator: true },
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
