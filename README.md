# Frankreich Roadtrip Planner v5 – „richtig online“ mit Cloud Sync

Diese Version kann **Design/Funktionen** wie gewohnt als statische Website hosten (GitHub Pages / Netlify),
und zusätzlich **Inhalte zentral** in der Cloud speichern, damit du auf **allen Geräten den gleichen Stand** hast.

Cloud-Backend: **Supabase** (kostenloser Plan reicht)

---

## 1) Online hosten (GitHub Pages / Netlify)
Wie vorher (statisch). Danach ist die Website unter einer URL erreichbar.

---

## 2) Supabase einrichten (10–15 min)

### A) Projekt erstellen
1. supabase.com → New Project
2. Region wählen, Passwort setzen
3. Im Projekt:
   - Settings → API: **Project URL** + **anon public key** kopieren

### B) Auth aktivieren
Authentication → Providers → Email: aktiv (Standard)

### C) Tabelle anlegen
SQL Editor → New query → ausführen:

```sql
-- Table for trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  slug text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists trips_owner_slug_unique
on public.trips(owner, slug);

alter table public.trips enable row level security;

-- Policies: nur der Owner darf lesen/schreiben
create policy "trips_select_own" on public.trips
for select using (owner = auth.uid());

create policy "trips_insert_own" on public.trips
for insert with check (owner = auth.uid());

create policy "trips_update_own" on public.trips
for update using (owner = auth.uid()) with check (owner = auth.uid());
```

> Hinweis: Der Planner speichert `owner` automatisch als deine User-ID.

---

## 3) Cloud Sync im Planner nutzen
1. Website öffnen → Button **Cloud Sync**
2. Supabase URL + anon key eintragen
3. E-Mail + Passwort → **Registrieren** (einmalig) → dann **Login**
4. Trip-ID setzen (z.B. `frankreich-2026`)
5. **In Cloud speichern** / **Aus Cloud laden**
6. Optional: **Auto-Sync** aktivieren

---

## 4) Updates ohne Datenverlust
- Du kannst jederzeit neue Versionen (HTML/CSS/JS) deployen.
- Deine Inhalte bleiben in Supabase (Cloud) und können jederzeit wieder geladen werden.
- Zusätzlich gibt es weiterhin Export/Import.

---

## CDN Hinweis
Supabase JS wird via CDN eingebunden:
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
Quelle: Supabase Docs „Install via CDN“.

---

## Komfort-Setup: Handy ohne Login (Auto-Load)
Damit du am Handy **nichts eingeben** musst, trage URL + Publishable Key + Trip-ID einmal in `config.js` ein:

1) GitHub Repo öffnen → Datei `config.js` → **Edit (Stift)**
2) Ersetzen:
- `PASTE_SUPABASE_URL_HERE` → deine Supabase Project URL
- `PASTE_SB_PUBLISHABLE_KEY_HERE` → dein Publishable key (`sb_publishable_...`)
- `TRIP_SLUG` → deine Trip-ID (z.B. `frankreich-2026`)
3) Commit

Danach:
- Seite am Handy öffnen → lädt automatisch aus der Cloud (ohne Login)
- Bearbeiten/Schreiben bleibt weiterhin nur per Login im Cloud-Sync-Dialog möglich.

Sicherheit:
- Verwende **nie** einen `sb_secret_...` Key im Browser.
