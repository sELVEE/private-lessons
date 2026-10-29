# Plan implementacji

Platforma do zarządzania uczniami na korepetycjach. Na start matematyka i jeden korepetytor, ale model danych od początku obsługuje wielu korepetytorów i szkoły.

Legenda: ✅ zrobione · 🔜 następne · ⏳ później (świadomie odłożone)

## Decyzje

| Temat            | Decyzja                                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zakładanie kont  | Oba sposoby: uczeń rejestruje się sam i dołącza kodem/linkiem **albo** korepetytor go zaprasza (etap 2).                                                                                                                                                                    |
| Skala            | Platforma dla wielu korepetytorów/szkół (tabela `organizations`), na start jeden korepetytor.                                                                                                                                                                               |
| Nieletni / RODO  | Poniżej 16 lat wymagana zgoda rodzica (link e-mail). Zbieramy minimum: imię lub pseudonim, e-mail, login, poziom szkoły, klasa, **rok** urodzenia. Bez nazwiska, adresu, telefonu, pełnej daty urodzenia. E-mail rodzica nie jest zapisywany (tylko HMAC jako dowód zgody). |
| Lekcje grupowe   | ⏳ **Odłożone.** Model zakłada `lesson_participants`, ale UI i logika rozliczeń najpierw dla lekcji indywidualnych.                                                                                                                                                         |
| Odwołania lekcji | Odwołanie **nie** nalicza opłaty automatycznie — korepetytor potwierdza. W ustawieniach może włączyć automat: „odwołanie później niż X godzin przed lekcją = płatne”.                                                                                                       |
| Hosting          | Wybór później, najtańsza opcja. Najpierw lokalnie + Docker.                                                                                                                                                                                                                 |
| Fonty            | Hostowane razem z aplikacją (bez Google Fonts — adresy IP użytkowników nie trafiają do Google).                                                                                                                                                                             |

## Etapy

### Etap 0 — fundament ✅

- Monorepo pnpm: `apps/api`, `apps/web`, `packages/shared`.
- Docker Compose: Postgres 17, Redis, Mailpit; profil `app` z obrazami API i web (nginx + CSP).
- CI: typecheck, testy na Postgresie, build, Prettier, `pnpm audit`; CodeQL; Dependabot.

### Etap 1 — konta i bezpieczne logowanie ✅

- Rejestracja: uczeń / korepetytor / rodzic; dla ucznia poziom szkoły, klasa, rok urodzenia.
- Logowanie jako ekran powitalny; weryfikacja e-maila; zgoda rodzica dla < 16 lat.
- Argon2id, HIBP, blokada po nieudanych próbach, rate limiting.
- MFA TOTP + kody zapasowe, obowiązkowe dla admina.
- Reset hasła, zmiana hasła, lista sesji, wylogowanie ze wszystkich urządzeń.
- Alert o logowaniu z nowego urządzenia z linkiem „to nie ja” (blokuje konto, kończy sesje).
- Dziennik audytu tylko do dopisywania.
- Widoki zależne od roli (menu, pulpit).

### Etap 2 — role, organizacje i uczniowie ✅

- Zaproszenia: korepetytor tworzy kod/link (z limitem użyć i ważnością) albo wysyła zaproszenie e-mail (przyjmie je tylko konto z tym adresem). Uczeń bez konta otwiera link → rejestracja → po zalogowaniu wraca do dołączania.
- Współpraca (`enrollments`): korepetytor × uczeń × przedmiot, cele nauki, status (aktywna / wstrzymana / zakończona), historia zmian (`enrollment_events`).
- Przedmioty i drzewo tematów; nowy korepetytor dostaje „Matematykę”.
- Rodzic ↔ dziecko: dziecko generuje jednorazowy kod (24 h), rodzic go wpisuje; każda strona może usunąć połączenie, dziecko dostaje e-mail o połączeniu.
- Uczeń edytuje poziom szkoły i klasę.
- **Row-Level Security**: dane domenowe czytane wyłącznie jako rola `pl_app` z ustawionym `app.user_id`; polityki w migracji `0001_teaching_core.sql`. Inny korepetytor — nawet w tej samej organizacji — nie widzi cudzych uczniów; rola `pl_app` nie ma dostępu do hashy haseł ani sekretów MFA.
- Panel administratora: wyszukiwanie kont i blokowanie, tylko z MFA zweryfikowanym w tej sesji, z obowiązkowym powodem zapisywanym w audycie; bez wglądu w lekcje, notatki i płatności.
- ⏳ Wybór organizacji dla korepetytora uczącego w kilku szkołach; zapraszanie korepetytorów do organizacji-szkoły.

### Etap 3 — kalendarz i lekcje ✅

- Widok tygodnia (kalendarz korepetytora, plan ucznia i rodzica), nawigacja po tygodniach.
- Lekcje indywidualne, powtarzanie co tydzień (do 26 razy), miejsce/link, temat; kontrola kolizji terminów korepetytora.
- Przekładanie (z historią zmian i e-mailem do drugiej strony), odwoływanie przez korepetytora lub ucznia.
- Polityka odwołań w ustawieniach: okno „późnego” odwołania (h) i opcjonalny automat opłaty; bez automatu późne odwołanie czeka na decyzję korepetytora (lista „do decyzji”). Odwołanie przez korepetytora nigdy nie jest płatne.
- Obecność (obecny / spóźniony / nieobecny) po rozpoczęciu lekcji; frekwencja i historia lekcji w karcie ucznia; najbliższe lekcje na pulpitach.
- Przypomnienia e-mail ok. 24 h przed lekcją (zadanie co minutę z blokadą w Redisie).
- RLS dla `lessons`, `lesson_changes`, `org_settings`.
- ⏳ Lekcje grupowe. ⏳ Google Calendar. ⏳ Web Push.

### Etap 4 — notatki i raporty ✅

- Wspólna notatka do każdej lekcji: edytują ją wyłącznie korepetytor i uczeń tej lekcji (rodzic, właściciel organizacji i inni korepetytorzy nie mają dostępu — także na poziomie RLS). Treść szyfrowana AES-256-GCM, historia wersji z możliwością przywrócenia.
- Raport po lekcji (podsumowanie, omówione zagadnienia, dalsze kroki, zaangażowanie 1–5): pisze korepetytor, widzą uczeń i połączeni rodzice; przy pierwszym zapisie e-mail do ucznia i rodziców.
- Strona lekcji: szczegóły, historia zmian, notatka, raport.

### Etap 5 — rozliczenia

- Cena za godzinę lub pakiet lekcji, per uczeń/przedmiot.
- Księga (`ledger_entries`): naliczenia z odbytych lekcji, wpłaty, zaległości.
- Rozliczenie miesięczne dla każdego ucznia, podsumowanie zarobków.
- ⏳ Rachunki/faktury (PDF, ewentualnie KSeF). Danych kart nie przechowujemy — ewentualne płatności online przez operatora.

### Etap 6 — materiały i zadania domowe

- Biblioteka materiałów według przedmiotu i tematu (Markdown + KaTeX).
- Zadania domowe z terminem, oddawaniem i oceną.
- ⏳ Pliki (PDF, zdjęcia, prezentacje) i linki. ⏳ Tablica online. ⏳ Lekcje online.

### Etap 7 — postępy

- Oceny i wyniki testów, tematy opanowane / do powtórki, cele i postęp w czasie.
- Podsumowania dla ucznia i rodzica.

### Etap 8 — PWA i dopracowanie

- Offline dla planu lekcji, instalacja na telefonie, dostępność (WCAG), testy e2e (Playwright) każdej roli.

### ⏳ Później (serwer)

- Kopie zapasowe: automatyczne, szyfrowane, poza głównym środowiskiem, niemodyfikowalne (object lock), regularne testy odtwarzania.
- Monitoring: alerty o nietypowej aktywności, logi chronione przed modyfikacją, procedury reagowania na incydenty, testy bezpieczeństwa.

## Model danych

Zaimplementowane (`apps/api/src/db/schema.ts`):

| Tabela             | Opis                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `organizations`    | tenant: pracownia korepetytora / szkoła                                        |
| `users`            | konto; hash Argon2id; zaszyfrowany sekret MFA; status                          |
| `student_profiles` | poziom szkoły, klasa, rok urodzenia                                            |
| `memberships`      | użytkownik × organizacja × rola (`owner`, `tutor`, `student`, `parent`)        |
| `sessions`         | sesje; tylko HMAC tokenu                                                       |
| `user_tokens`      | jednorazowe tokeny e-mail (weryfikacja, reset, zgoda, „to nie ja”); tylko HMAC |
| `mfa_backup_codes` | HMAC kodów zapasowych                                                          |
| `known_devices`    | HMAC identyfikatora przeglądarki — wykrywanie nowych urządzeń                  |
| `parent_consents`  | dowód zgody rodzica (HMAC e-maila, data)                                       |
| `audit_log`        | dziennik bezpieczeństwa, tylko dopisywanie                                     |

Etap 2: `subjects`, `topics`, `invites`, `enrollments`, `enrollment_events`, `parent_link_codes`, `parent_links` — wszystkie z RLS.

Planowane: `lessons`, `lesson_participants`, `lesson_changes`, `lesson_notes`, `note_revisions`, `price_plans`, `packages`, `ledger_entries`, `monthly_statements`, `materials`, `homework`, `homework_submissions`, `assessments`, `topic_mastery`, `goals`, `lesson_reports`, `org_settings` (m.in. polityka odwołań).

## Bezpieczeństwo

Mapowanie wymagań na implementację. ✅ = jest w kodzie, 🔜/⏳ = zaplanowane.

### 1. Logowanie i konta

| Wymaganie                      | Realizacja                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silne hasła, bezpieczne skróty | ✅ Argon2id (m=64 MiB, t=3, p=1), automatyczny rehash; min. 12 znaków; zakaz loginu/e-maila w haśle; HIBP k-anonymity                                                   |
| MFA, obowiązkowe dla adminów   | ✅ TOTP (RFC 6238) z ochroną przed powtórzeniem kodu, 10 kodów zapasowych; admin bez MFA ma dostęp tylko do konfiguracji MFA                                            |
| Ograniczenie prób logowania    | ✅ licznik na identyfikator (także nieistniejący) z wykładniczą blokadą; limity na IP i trasę w Redisie; limit prób kodu MFA. 🔜 CAPTCHA (Turnstile) po kilku porażkach |
| Odzyskiwanie konta             | ✅ token jednorazowy 30 min, ta sama odpowiedź dla istniejących i nieistniejących adresów, po resecie unieważnienie wszystkich sesji i e-mail z powiadomieniem          |
| Wylogowanie wszędzie           | ✅ sesje w bazie, lista urządzeń, pojedyncze i masowe unieważnianie; zmiana hasła kończy inne sesje                                                                     |
| Podejrzane logowania           | ✅ e-mail przy logowaniu z nowej przeglądarki z linkiem „to nie ja” (blokada konta + koniec sesji). 🔜 sygnały geolokalizacyjne                                         |

### 2. RBAC

| Wymaganie                                   | Realizacja                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sprawdzanie na serwerze przy każdym żądaniu | ✅ globalny `AuthGuard` (domyślnie wszystko wymaga sesji), dostęp do sesji tylko właściciela. 🔜 polityki per rekord + RLS w Postgresie (etap 2) |
| Rozdzielenie korepetytorów                  | 🔜 każdy rekord ma `organization_id`; RLS jako druga warstwa                                                                                     |
| Ograniczony admin                           | ✅ MFA obowiązkowe, flaga nienadawalna przez API. 🔜 każdy wgląd admina w dane audytowany                                                        |

### 3. Dane osobowe

| Wymaganie            | Realizacja                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimalizacja        | ✅ patrz „Decyzje”: brak nazwiska, adresu, telefonu, pełnej daty urodzenia; e-mail rodzica niezapisywany                                                             |
| HTTPS/TLS            | ✅ ciasteczka `Secure` wymuszone w produkcji. ⏳ TLS na reverse proxy (Caddy) przy wyborze hostingu                                                                  |
| Szyfrowanie w bazie  | ✅ AES-256-GCM z wersjonowaniem klucza (sekrety MFA). 🔜 notatki z lekcji. ⏳ szyfrowanie wolumenów/kopii                                                            |
| Klucze               | ✅ tylko ze zmiennych środowiskowych, walidowane przy starcie. ⏳ menedżer sekretów (Infisical/Doppler/KMS) przy wyborze hostingu                                    |
| Okres przechowywania | 🔜 zadanie cykliczne: wygasłe sesje/tokeny, nieaktywowane konta po 30 dniach, audyt po 12 miesiącach, dane ucznia po X miesiącach od końca współpracy (do ustalenia) |

### 4. API i serwer

| Wymaganie                    | Realizacja                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Walidacja wejścia            | ✅ Zod na każdym body, nieznane pola usuwane                                 |
| SQL Injection                | ✅ wyłącznie zapytania parametryzowane (Drizzle)                             |
| XSS                          | ✅ Angular escapuje szablony; CSP `script-src 'self'` w nginx i API          |
| CSRF                         | ✅ `SameSite=Lax` + kontrola `Origin`/`Sec-Fetch-Site` + double-submit token |
| Rate limiting, rozmiar żądań | ✅ globalny limit na IP, ostrzejsze na trasach wrażliwych; body max 100 kB   |
| Ciasteczka                   | ✅ `HttpOnly`, `Secure`, `SameSite`, prefiks `__Host-` w produkcji           |
| Kontrola dostępu do rekordów | ✅ sesje; 🔜 lekcje, faktury, pliki (etapy 2–6)                              |
| Sekrety poza kodem           | ✅ `.env` w `.gitignore`/`.dockerignore`, przykład w `.env.example`          |
| Aktualizacje i skanowanie    | ✅ Dependabot, `pnpm audit` w CI, CodeQL (security-extended)                 |

### 6. Pliki (⏳ razem z materiałami)

Walidacja typu po sygnaturze, limity rozmiaru, biała lista formatów, ClamAV, prywatny bucket S3 (MinIO lokalnie), podpisane linki ważne kilka minut wydawane po sprawdzeniu uprawnień.

### 7–8. Kopie i monitoring (⏳)

Patrz „Później (serwer)”. Już teraz: dziennik audytu logowań, zmian haseł/MFA i sesji, chroniony triggerem przed modyfikacją.
