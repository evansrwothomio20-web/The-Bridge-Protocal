# The Bridge Protocol — Backend API

A clean, production-ready **FastAPI + Supabase** backend that powers The Bridge Protocol marketplace — connecting clients with skilled workers.

> **100% Pure Python** — no Rust, no compiler toolchain, no MSYS2 tricks.  
> Installs with a single `pip install -r requirements.txt` on any machine.

---

## Project Structure

```
the Bridge Protocal/
├── app/
│   ├── config.py          ← Settings loaded from .env
│   ├── database.py        ← Supabase REST API helpers (uses httpx, no supabase package)
│   ├── models/
│   │   └── task.py        ← Pydantic v1 request/response schemas
│   └── routers/
│       └── tasks.py       ← All /api/tasks endpoints
├── main.py                ← App entry point
├── requirements.txt       ← Pure Python dependencies
├── .env                   ← Your secrets (never commit this)
├── .env.example           ← Template for .env
└── .gitignore
```

---

## Quick Start

### 1 — Install dependencies

```bash
pip install -r requirements.txt
```

That's it. No Rust, no MSYS2, no build tools needed.

### 2 — Add your Supabase key

Open `.env` and replace the placeholder with your real **anon/public** key from  
`Supabase Dashboard → Project Settings → API → Project API keys`:

```env
SUPABASE_URL=https://gduqadfufdqbnyfxrlra.supabase.co
SUPABASE_KEY=your_real_anon_key_here
```

### 3 — Run the API server

```bash
uvicorn main:app --reload
```

The API will be live at **http://localhost:8000**

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/api/tasks/` | List all open tasks |
| `GET` | `/api/tasks/{id}` | Get a single task by ID |
| `POST` | `/api/tasks/` | Create a new task |
| `PATCH` | `/api/tasks/{id}/status` | Update a task's status |
| `DELETE` | `/api/tasks/{id}` | Delete a task |

### Interactive Docs
- **Swagger UI** → http://localhost:8000/docs
- **ReDoc** → http://localhost:8000/redoc

---

## Supabase Table Schema

Make sure your Supabase project has a `tasks` table with these columns:

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | Primary key, default `gen_random_uuid()` |
| `title` | `text` | Required |
| `description` | `text` | Required |
| `category` | `text` | Required |
| `budget` | `numeric` | Required, > 0 |
| `client_id` | `text` | UUID of the posting client |
| `status` | `text` | One of: `open`, `in_progress`, `completed`, `cancelled` |
| `created_at` | `timestamptz` | Default `now()` |

---

## Task Status Flow

```
open → in_progress → completed
  └──────────────→ cancelled
```

---

## Tech Stack

| Package | Version | Why |
|---------|---------|-----|
| `fastapi` | 0.95.2 | Web framework (pydantic v1 compatible) |
| `uvicorn` | 0.29.0 | ASGI server |
| `httpx` | ≥0.24.0 | Calls Supabase REST API directly |
| `pydantic` | v1 (1.10.x) | Data validation — 100% pure Python |
| `python-dotenv` | ≥1.0.0 | Loads `.env` secrets |

> **Why no `supabase` package?**  
> The `supabase` Python client pulls in `cryptography` and `pydantic-core`,  
> both of which require a Rust compiler to build from source.  
> We call Supabase's PostgREST REST API directly with `httpx` instead —  
> same functionality, zero compilation required.
