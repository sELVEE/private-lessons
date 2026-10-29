# Wygląd aplikacji — kierunek C „Najpierw: co teraz”

Makiety (wersja 1, kierunki A, B i C; dla C: pulpit, karta ucznia, telefon, kalendarz, rozliczenia):
https://claude.ai/artifact/RcboPTGRyHsVWN68UV3gb1 — link prywatny, otwiera go tylko właściciel konta.

Status: **wdrożony** (kierunek C).

## Założenia

- Każdy ekran zaczyna się od zdania o tym, co jest teraz („Dzień dobry, Anna. Co robimy?”, „W tym miesiącu
  wpłynęło X. Do odebrania zostało Y.”), a pod nim są gotowe akcje — bez szukania w menu.
- Nawigacja według wytycznych Material 3 (`features/shell`, `features/nav.ts`): od 1200 px boczna nawigacja
  z etykietami, 600–1199 px „navigation rail” (ikona nad podpisem), poniżej 600 px dolny pasek nawigacji
  z maks. 5 miejscami + „Więcej” i górny pasek z menu konta.
- Ciemna karta (`.pl-card-dark`) wyróżnia jedną najważniejszą rzecz na ekranie: następną lekcję, wybraną lekcję
  w kalendarzu, skrót ucznia, wykres wpłat.
- Interakcje: klikalne kafelki unoszą się po najechaniu (`.pl-hover`), wiersze dostają warstwę stanu
  (`.pl-row-hover`), wykresy pokazują wartość punktu w tooltipie Material; `prefers-reduced-motion` wyłącza animacje.
- Kalendarz: widok dzień / tydzień / miesiąc, pionowa siatka godzin, szczegóły i formularze w bocznym panelu
  (`mat-drawer`), godziny poza pracą (szablon tygodnia + wyjątki na dni) są wyszarzone.
- Każdy uczeń ma stały kolor (`shared/person-color.ts`) — w tygodniu, kalendarzu i rozliczeniach.

## Tokeny

| Element      | Wartość                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Tło          | `#DFE2CF` (szałwia), karty `#F7F8F1`                                        |
| Tusz         | `#23291E` — tekst, ciemne karty, główne przyciski                           |
| Akcent       | terakota: wypełnienie `#E08A5F`, tekst `#A84F2C` (bez żółtego)              |
| Kroje        | Instrument Serif (nagłówki, kwoty), Manrope (interfejs); hostowane lokalnie |
| Zaokrąglenia | subtelne: 4–6 px kontrolki i przyciski, 8 px panele, 12 px karty            |

## Implementacja

Wszystko przez system motywów Angular Material (https://material.angular.dev/guide/theming):

- `apps/web/src/styles.scss`: `mat.theme(...)` z krojami `brand-family`/`plain-family`, `mat.theme-overrides(...)`
  z kolorami i kształtami (`--mat-sys-*`), mixiny `mat.<komponent>-overrides(...)` dla kart, przycisków, pól,
  list, chipów i przełączników.
- Warianty przycisków jako klasy z zakresowym `mat.button-overrides`: `.pl-accent` (terakota), `.pl-on-dark`
  (na ciemnej karcie), `.large`. Przyciski w szablonach: `matButton="filled" | "outlined"` / `matButton`.
- Zmienne `--pl-*` są tylko aliasami tokenów `--mat-sys-*`, dzięki czemu style ekranów nie mają własnych kolorów.
