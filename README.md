# FinSim

Simulering af privat økonomi. Bygget med Next.js, TypeScript, Tailwind CSS og PostgreSQL.

## Lokal opsætning

### 1. Installer afhængigheder

```bash
npm install
```

### 2. Miljøvariabler

Kopiér eksempelfilen og udfyld værdierne:

```bash
cp .env.example .env.local
```

Redigér `.env.local`:

| Variabel | Beskrivelse |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Lang tilfældig streng til JWT-signering |

### 3. Opret databasetabel

Kør følgende SQL mod din PostgreSQL-database:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Start udviklingsserveren

```bash
npm run dev
```

Åbn [http://localhost:3000](http://localhost:3000).

## Produktion

- **Frontend + API:** Vercel (forbind GitHub-repo direkte)
- **Database:** Railway (PostgreSQL) — indsæt `DATABASE_URL` og `JWT_SECRET` som environment variables i Vercel

## Sider

| Sti | Beskrivelse |
|---|---|
| `/` | Beskyttet startside — kræver login |
| `/login` | Login med e-mail og adgangskode |
| `/register` | Opret ny bruger |

## API-routes

| Route | Metode | Beskrivelse |
|---|---|---|
| `/api/auth/register` | POST | Opret bruger |
| `/api/auth/login` | POST | Log ind — sætter JWT-cookie |
| `/api/auth/logout` | POST | Log ud — sletter cookie |
| `/api/auth/me` | GET | Returnerer aktuel bruger (401 hvis ikke logget ind) |
