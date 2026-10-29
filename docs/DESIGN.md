# Propozycja nowego wyglądu

Makiety (przewodnik stylu, logowanie, pulpit korepetytora, widok ucznia na telefonie):
https://claude.ai/artifact/RcboPTGRyHsVWN68UV3gb1 — link prywatny, otwiera go tylko właściciel konta.

Status: **propozycja** — do akceptacji przed wdrożeniem.

## Kierunek

Lekki, przyjazny, nowoczesny: jasne tło, białe karty z miękkim cieniem, duże zaokrąglenia, jeden akcent,
dużo powietrza. Mniej „Material z 2015”, więcej spokojnej aplikacji do nauki.

| Element      | Teraz                  | Propozycja                                                                             |
| ------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| Krój         | Roboto                 | Plus Jakarta Sans (400–800), liczby tabelaryczne                                       |
| Tło          | szare Material         | `#F6F7FB`, karty `#FFFFFF`                                                             |
| Akcent       | niebieski Material     | indygo `#4F46E5`, jasny `#EEF0FF` (do zmiany jednym tokenem)                           |
| Stany        | domyślne               | sukces `#10B39A`, uwaga `#F59E0B`, błąd/zaległość `#E5484D` — zawsze z tłem pastelowym |
| Zaokrąglenia | 4–12 px                | 12 px kontrolki, 20–24 px karty, pigułki dla statusów                                  |
| Cienie       | Material elevation     | 2 poziomy: `0 1px 2px` + `0 8px 24px` o niskiej przezroczystości                       |
| Menu         | ciemny sidenav z listą | biała karta z ikonami liniowymi i aktywną „pigułką”; na telefonie dolna nawigacja      |
| Pulpit       | karty z listami        | KPI u góry, „Dzisiejszy plan” jako oś czasu, „Do decyzji”, paski postępu celów         |

## Jak wdrożyć (ok. 1–2 dni)

1. **Tokeny**: w `apps/web/src/styles.scss` zastąpić `mat.theme(...)` własną paletą (`mat.$violet-palette` lub paleta
   wygenerowana z `#4F46E5`) i nadpisać tokeny systemowe M3 (`--mat-sys-surface`, `--mat-sys-surface-container*`,
   `--mat-sys-corner-*`), plus własne zmienne `--pl-radius-card`, `--pl-shadow-1/2`.
2. **Font**: `@fontsource-variable/plus-jakarta-sans` zamiast Roboto (hostowany lokalnie, bez Google Fonts — RODO).
3. **Komponenty**: przyciski `mat-flat-button` → wysokość 44 px, radius 12 px (tokeny `--mat-button-*`); pola
   formularzy w wariancie `outline` z radius 12 px; karty bez obramowania, z cieniem.
4. **Shell**: biały sidenav z zaokrągleniem i marginesem, aktywny element jako pigułka; na szerokości < 840 px dolna
   nawigacja (4–5 pozycji zależnie od roli) zamiast szuflady.
5. **Pulpity**: przebudowa `home-page` wg makiety (KPI, oś czasu dnia, „do decyzji”, paski celów).
6. **Ciemny motyw**: te same tokeny w wersji ciemnej (`color-scheme: light dark` już jest).
