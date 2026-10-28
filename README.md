# Korepetycje — platforma do zarządzania korepetycjami

PWA dla korepetytorów, uczniów i rodziców: lekcje, notatki, rozliczenia, materiały i postępy.
Plan i decyzje projektowe: [docs/PLAN.md](docs/PLAN.md).

## Stos

| Warstwa        | Technologia                                                        |
| -------------- | ------------------------------------------------------------------ |
| Frontend       | Angular 22 (standalone, signals), Angular Material, Service Worker |
| Backend        | NestJS 12 (Node 24 LTS, ESM)                                       |
| Baza           | PostgreSQL 17 + Drizzle ORM (migracje SQL w `apps/api/drizzle`)    |
| Kolejki/limity | Redis                                                              |
| Wspólne typy   | `packages/shared` — schematy Zod używane przez API i frontend      |
| Testy          | Vitest (jednostkowe + integracyjne na prawdziwym Postgresie)       |

```
apps/api         NestJS API (/api)
apps/web         Angular PWA
packages/shared  schematy Zod, enumy, typy odpowiedzi API
infra/           pomocnicze pliki Dockera
docs/            plan i decyzje
```

## Uruchomienie lokalne

Wymagania: Node 24 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
```

```bash
docker compose up -d
```

To uruchamia Postgres, Redis i Mailpit. Wszystkie e-maile aplikacji (linki weryfikacyjne, reset hasła) zobaczysz na http://localhost:8025.

```bash
cp apps/api/.env.example apps/api/.env
```

Uzupełnij `DATA_ENCRYPTION_KEY` i `TOKEN_HASH_KEY`. Każdy klucz generujesz tak:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
pnpm --filter @pl/shared build && pnpm --filter @pl/api build && pnpm db:migrate
```

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Aplikacja: http://localhost:4200 (proxy `/api` → `localhost:3000`).

### Cały stack w Dockerze

```bash
docker compose --profile app up -d --build
```

Aplikacja: http://localhost:8080. Wymaga `apps/api/.env` z kluczami jak wyżej.

### Testy

```bash
pnpm test
```

Testy API potrzebują bazy `private_lessons_test` (tworzy ją `docker compose up`) i Redisa. Adresy można nadpisać przez `TEST_DATABASE_URL` / `TEST_REDIS_URL`.

### Konto administratora

Administratora nie da się zarejestrować przez API. Nadaj flagę ręcznie w bazie:

```sql
UPDATE users SET is_platform_admin = true WHERE email = 'ty@example.com';
```

Po zalogowaniu aplikacja wymusi włączenie weryfikacji dwuetapowej.

## Bezpieczeństwo w skrócie

- Hasła: Argon2id (64 MiB, t=3), min. 12 znaków, sprawdzanie w HIBP (k-anonymity).
- Sesje po stronie serwera; w ciasteczku `HttpOnly; Secure; SameSite=Lax` tylko losowy token, w bazie jego HMAC.
- MFA (TOTP + kody zapasowe), obowiązkowe dla administratorów.
- Blokada po nieudanych logowaniach (także dla nieistniejących kont), rate limiting w Redisie.
- CSRF: kontrola `Origin` + double-submit token. Helmet, CSP, limit 100 kB na body.
- Sekret TOTP szyfrowany AES-256-GCM, klucze tylko ze zmiennych środowiskowych / menedżera sekretów.
- Dziennik audytu tylko do dopisywania (trigger w bazie).

Szczegóły i mapowanie na wymagania: [docs/PLAN.md](docs/PLAN.md#bezpieczeństwo).
