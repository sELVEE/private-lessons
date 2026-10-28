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
pnpm run bootstrap
```

Jedna komenda robi wszystko: instaluje zależności, tworzy `apps/api/.env` z wygenerowanymi kluczami, uruchamia Postgres/Redis/Mailpit, buduje projekt, wykonuje migracje i zakłada konta demo:

| Login         | Rola                                                |
| ------------- | --------------------------------------------------- |
| `admin`       | administrator (przy pierwszym logowaniu wymusi MFA) |
| `korepetytor` | korepetytor                                         |
| `uczen`       | uczeń (szkoła średnia, 2 klasa)                     |
| `rodzic`      | rodzic                                              |

Hasło do wszystkich: `Demo-haslo-2026` (tylko lokalnie — skrypt odmawia działania przy `NODE_ENV=production`).

Potem w dwóch terminalach:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Aplikacja: http://localhost:4200. E-maile (linki weryfikacyjne, reset hasła): http://localhost:8025.

### Cały stack w Dockerze

```bash
docker compose --profile app up -d --build
```

Aplikacja: http://localhost:8080. Wymaga `apps/api/.env` — utworzysz go przez `pnpm setup:env`.

### Testy

```bash
pnpm test
```

Testy API potrzebują bazy `private_lessons_test` (tworzy ją `docker compose up`) i Redisa. Adresy można nadpisać przez `TEST_DATABASE_URL` / `TEST_REDIS_URL`.

### Konto administratora

Uprawnień administratora nie da się nadać przez API, tylko z konsoli serwera:

```bash
pnpm admin:grant ty@example.com
```

Odebranie: `pnpm admin:grant ty@example.com --revoke`. W Dockerze: `docker compose exec api node dist/cli/grant-admin.js ty@example.com`. Zmiana kończy sesje tego konta, a przy następnym logowaniu aplikacja wymusi MFA.

## Bezpieczeństwo w skrócie

- Hasła: Argon2id (64 MiB, t=3), min. 12 znaków, sprawdzanie w HIBP (k-anonymity).
- Sesje po stronie serwera; w ciasteczku `HttpOnly; Secure; SameSite=Lax` tylko losowy token, w bazie jego HMAC.
- MFA (TOTP + kody zapasowe), obowiązkowe dla administratorów.
- Blokada po nieudanych logowaniach (także dla nieistniejących kont), rate limiting w Redisie.
- CSRF: kontrola `Origin` + double-submit token. Helmet, CSP, limit 100 kB na body.
- Sekret TOTP szyfrowany AES-256-GCM, klucze tylko ze zmiennych środowiskowych / menedżera sekretów.
- Dziennik audytu tylko do dopisywania (trigger w bazie).

Szczegóły i mapowanie na wymagania: [docs/PLAN.md](docs/PLAN.md#bezpieczeństwo).
