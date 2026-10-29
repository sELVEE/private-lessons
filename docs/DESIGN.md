# Wygląd aplikacji — kierunek C „Najpierw: co teraz”

Makiety (wersja 1, kierunki A, B i C; dla C: pulpit, karta ucznia, telefon, kalendarz, rozliczenia):
https://claude.ai/artifact/RcboPTGRyHsVWN68UV3gb1 — link prywatny, otwiera go tylko właściciel konta.

Status: **wdrożony** (kierunek C, z późniejszymi poprawkami: nawigacja M3, subtelne zaokrąglenia, jedna skala rozmiarów i odstępów).

## Założenia

- Każdy ekran zaczyna się od nagłówka (`pl-page-header`: tytuł, podtytuł, akcje po prawej), a najczęstsze
  działania są dostępne od razu — bez szukania w menu. Tytuły i etykiety są rzeczowe („Należności”, „Wymaga
  uwagi”, „Plan tygodnia”), bez potocznych sformułowań.
- Nawigacja według wytycznych Material 3 (`features/shell`, `features/nav.ts`): od 1200 px boczna nawigacja
  z etykietami, 600–1199 px „navigation rail” (ikona nad podpisem), poniżej 600 px dolny pasek nawigacji
  z maks. 5 miejscami + „Więcej” i górny pasek z menu konta.
- Ciemna sekcja (`<pl-section tone="dark">`) wyróżnia jedną najważniejszą rzecz na ekranie: najbliższą lekcję,
  podsumowanie ucznia, wykres wpłat.
- Interakcje: klikalne kafelki unoszą się po najechaniu (`.pl-hover`), wiersze dostają warstwę stanu
  (`.pl-row-hover`), wykresy pokazują wartość punktu w tooltipie Material; `prefers-reduced-motion` wyłącza animacje.
- Kalendarz: widok dzień / tydzień / miesiąc, pionowa siatka godzin, szczegóły i formularze w bocznym panelu
  (`mat-drawer`), godziny poza pracą (szablon tygodnia + wyjątki na dni) są wyszarzone.
- Każdy uczeń ma stały kolor (`shared/person-color.ts`) — w tygodniu, kalendarzu i rozliczeniach.

## Tokeny

| Element      | Wartość                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| Tło          | `#DFE2CF` (szałwia), karty `#F7F8F1`                                             |
| Tusz         | `#23291E` — tekst, ciemne karty, główne przyciski                                |
| Akcent       | terakota: wypełnienie `#E08A5F`, tekst `#A84F2C` (bez żółtego)                   |
| Kroje        | Instrument Serif (nagłówki, kwoty), Manrope (interfejs); hostowane lokalnie      |
| Zaokrąglenia | subtelne: 4–6 px kontrolki i przyciski, 8 px panele, 12 px karty                 |
| Kontrolki    | 42 px: przyciski, pola (outline), selecty, przełączniki, przyciski-ikony         |
| Tagi         | 28 px (2/3 kontrolki): chipy, statusy `.pl-tag`, liczniki, małe awatary          |
| Nagłówki     | h1 32–44 px (`.page-head` z akcjami po prawej), h2 = tytuł karty 26 px, h3 18 px |

## Wspólne komponenty (`apps/web/src/app/shared/ui`)

| Komponent            | Zastosowanie                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| `pl-page-header`     | nagłówek strony: powrót, nadtytuł, tytuł, podtytuł, akcje                  |
| `pl-section`         | sekcja na karcie Material: tytuł, licznik, akcje (`[sectionActions]`), ton |
| `pl-period-nav`      | poprzedni / bieżący / następny okres (kalendarz, rozliczenia)              |
| `pl-stat`            | liczba z podpisem (saldo, wpłaty, frekwencja…)                             |
| `pl-avatar`          | inicjał w stałym kolorze osoby; `md` = kontrolka, `sm` = tag               |
| `pl-empty`           | pusty stan listy                                                           |
| `pl-date-field`      | data (datepicker) dla pól `YYYY-MM-DD`                                     |
| `pl-date-time-field` | dzień + godzina (timepicker) z krokiem rezerwacji                          |

## Odstępy

Tylko wartości ze skali `--pl-space-*`: 4 / 8 / 12 / 16 / 24 / 32 / 48 px. Strona (`.page`) to pionowy stos
z odstępem 24 px (16 px na telefonie) — bloki nie mają własnych marginesów. Karty i sekcje mają 24 px
wewnątrz (16 px na telefonie). Układy: `.pl-columns` (treść + kolumna boczna), `.pl-stack`, `.pl-grid`.
Przyciski formularzy: `.form-actions` (do prawej, główna akcja ostatnia).

## Implementacja

Wszystko przez system motywów Angular Material (https://material.angular.dev/guide/theming):

- `apps/web/src/styles.scss`: `mat.theme(...)` z krojami `brand-family`/`plain-family`, `mat.theme-overrides(...)`
  z kolorami i kształtami (`--mat-sys-*`), mixiny `mat.<komponent>-overrides(...)` dla kart, przycisków, pól,
  list, chipów i przełączników.
- Warianty przycisków jako klasy z zakresowym `mat.button-overrides`: `.pl-accent` (terakota), `.pl-on-dark`
  (na ciemnej karcie), `.large`. Przyciski w szablonach: `matButton="filled" | "outlined"` / `matButton`.
- Rozmiary: zmienne Sass `$control` / `$tag` w `styles.scss` trafiają do tokenów `button`, `icon-button`,
  `form-field`, `button-toggle` i `chips`; własne elementy używają `--pl-control-h` / `--pl-tag-h`.
- Domyślne opcje w `app.config.ts`: pola `outline` z dynamicznym miejscem na podpowiedź, przełączniki i chipy
  jednokrotnego wyboru bez znacznika ✓ (wybór pokazuje wypełnienie).
- Zmienne `--pl-*` są tylko aliasami tokenów `--mat-sys-*`, dzięki czemu style ekranów nie mają własnych kolorów.
