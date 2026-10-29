# Notatki dla Claude

Platforma do korepetycji (PWA). Plan, etapy i decyzje: `docs/PLAN.md`. Uruchomienie: `README.md`.

## Środowisko właściciela

- Windows. Claude Code uruchamiać w PowerShellu (Git Bash/mintty psuje wykrywanie terminala).
- Docker Desktop. Aplikację stawia `pnpm run bootstrap`, potem `pnpm dev:api` i `pnpm dev:web`.
- Aplikacja: http://localhost:4200 · e-maile (Mailpit): http://localhost:8025

## Konta testowe (tylko lokalnie, zakłada je `pnpm db:seed`)

Hasło do wszystkich: `Demo-haslo-2026`

| Login         | E-mail                   | Rola                                      |
| ------------- | ------------------------ | ----------------------------------------- |
| `admin`       | `admin@demo.local`       | administrator — przy logowaniu wymusi MFA |
| `korepetytor` | `korepetytor@demo.local` | korepetytor (Anna)                        |
| `uczen`       | `uczen@demo.local`       | uczeń (Kasia, szkoła średnia, 2 klasa)    |
| `rodzic`      | `rodzic@demo.local`      | rodzic (Marek)                            |

Dane demo: Kasia uczy się matematyki u Anny (lekcje, notatki, rozliczenia ze stawką 120 zł/h, materiał ze wzorami,
zadanie domowe, oceny i cele), Marek jest połączony z Kasią.

Nowe konta demo dopisywać tutaj i w `apps/api/src/cli/seed-dev.ts`.

## Konwencje

- Monorepo pnpm: `apps/api` (NestJS 12, ESM, Drizzle), `apps/web` (Angular 22), `packages/shared` (Zod).
- Walidacja wejścia: schemat Zod w `packages/shared`, na serwerze `ZodPipe`.
- Dostęp do danych domenowych przez `RlsService.run(userId, tx => …)` — Postgres RLS jako druga warstwa.
- Migracje: `pnpm db:generate`, ręczne dopiski SQL (RLS, triggery) na końcu wygenerowanego pliku. Tabele przypięte do współpracy mają kolumny `organization_id, enrollment_id, tutor_id, student_id` (`scoped()` w schemacie) i standardowe polityki RLS.
- Teksty w UI i komunikaty błędów po polsku.
- Przed commitem: `pnpm typecheck`, `pnpm test`, `pnpm exec prettier --check "**/*.{ts,html,scss,json,yml,md,mjs}"`.
