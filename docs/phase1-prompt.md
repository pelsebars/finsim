# FinSim — Phase 1 Prompt (Foundation & Auth)

Paste this prompt into a new Claude Code session in your FinSim repo.

---

## Prompt

Read `docs/spec.md` before starting. This is the full specification for FinSim. You are only building Phase 1 in this session.

---

## What you are building

Phase 1 is foundation only: project scaffolding and user authentication. No simulation logic. No gantt UI. No asset models. Just a working app where a user can register, log in, and see a protected page.

---

## Tech stack

- **Framework:** Next.js with TypeScript (covers both React frontend and API routes — deploys cleanly to Vercel)
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL (connection via `DATABASE_URL` environment variable — will point to Railway in production)
- **Auth:** Email + password. bcrypt for hashing. JWT stored in an httpOnly cookie.
- No OAuth. No MFA. No "forgot password".

---

## Deliverables

### Backend (API routes)

| Route | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Create user. Validate: email format, password min 8 chars, email not already taken. Return error messages if validation fails. |
| `/api/auth/login` | POST | Authenticate user. On success, set JWT in httpOnly cookie. |
| `/api/auth/logout` | POST | Clear the auth cookie. |
| `/api/auth/me` | GET | Return current user (id + email) if authenticated. Return 401 if not. |

### Database

Single table: `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Frontend pages

| Route | Description |
|---|---|
| `/register` | Registration form: email, password, confirm password. On success, redirect to `/`. |
| `/login` | Login form: email, password. On success, redirect to `/`. |
| `/` | Protected home page. If not authenticated, redirect to `/login`. Shows "Welcome, [email]" and a logout button. |

### App shell

A minimal top navigation bar — placeholder for the command area described in the spec. It should show the FinSim logo/name and the logout button when authenticated. Keep it clean and simple; it will be replaced in a later phase.

---

## What NOT to build in this phase

- No simulation or asset models
- No gantt view
- No graphs
- No save/load of simulations
- No multi-simulation support (that comes later)

---

## Code quality

- TypeScript throughout
- Tailwind for all styling
- Keep components simple — no heavy UI libraries needed yet
- Create `.env.example` documenting all required environment variables
- Create a `README.md` with local setup instructions (install, env vars, db setup, run)

---

## When you are done

Confirm the following works:
1. `npm run dev` starts the app locally
2. A new user can register at `/register`
3. The same user can log in at `/login`
4. `/` is protected and redirects to `/login` if not authenticated
5. Logout clears the session and redirects to `/login`
