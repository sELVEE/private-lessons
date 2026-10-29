# Wygląd aplikacji — kierunek C „Najpierw: co teraz”

Makiety (wersja 1, kierunki A, B i C; dla C: pulpit, karta ucznia, telefon, kalendarz, rozliczenia):
https://claude.ai/artifact/RcboPTGRyHsVWN68UV3gb1 — link prywatny, otwiera go tylko właściciel konta.

Status: **wdrożony** (kierunek C).

## Założenia

- Każdy ekran zaczyna się od zdania o tym, co jest teraz („Dzień dobry, Anna. Co robimy?”, „W tym miesiącu
  wpłynęło X. Do odebrania zostało Y.”), a pod nim są gotowe akcje — bez szukania w menu.
- Nawigacja to pływający dok na dole (na telefonie pełna szerokość), maks. 5 pozycji na rolę + „Więcej”
  (`features/nav.ts`). Górny pasek: marka, data, menu konta.
- Ciemna karta (`.pl-card-dark`) wyróżnia jedną najważniejszą rzecz na ekranie: następną lekcję, wybraną lekcję
  w kalendarzu, skrót ucznia, wykres wpłat.
- Każdy uczeń ma stały kolor (`shared/person-color.ts`) — w tygodniu, kalendarzu i rozliczeniach.

## Tokeny

| Element      | Wartość                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Tło          | `#DFE2CF` (szałwia), karty `#F7F8F1`                                        |
| Tusz         | `#23291E` — tekst, ciemne karty, główne przyciski                           |
| Akcent       | terakota: wypełnienie `#E08A5F`, tekst `#A84F2C` (bez żółtego)              |
| Kroje        | Instrument Serif (nagłówki, kwoty), Manrope (interfejs); hostowane lokalnie |
| Zaokrąglenia | karty 24–28 px, przyciski i chipy w kształcie pigułki                       |

## Implementacja

Wszystko przez system motywów Angular Material (https://material.angular.dev/guide/theming):

- `apps/web/src/styles.scss`: `mat.theme(...)` z krojami `brand-family`/`plain-family`, `mat.theme-overrides(...)`
  z kolorami i kształtami (`--mat-sys-*`), mixiny `mat.<komponent>-overrides(...)` dla kart, przycisków, pól,
  list, chipów i przełączników.
- Warianty przycisków jako klasy z zakresowym `mat.button-overrides`: `.pl-accent` (terakota), `.pl-on-dark`
  (na ciemnej karcie), `.large`. Przyciski w szablonach: `matButton="filled" | "outlined"` / `matButton`.
- Zmienne `--pl-*` są tylko aliasami tokenów `--mat-sys-*`, dzięki czemu style ekranów nie mają własnych kolorów.
