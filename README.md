# Staveto Office

Web app for Staveto office work: quotes and estimates management. Target domain: **app.staveto.com**.

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** (base-ui components)

## Run Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push the project to GitHub (or connect your repo).
2. Go to [vercel.com](https://vercel.com) → **Add New Project**.
3. Import the `staveto-office` repository.
4. Vercel will auto-detect Next.js. Click **Deploy**.
5. After deploy, go to **Project → Settings → Domains**.
6. Add custom domain: `app.staveto.com`.

## Connect app.staveto.com via DNS (Websupport)

In your Websupport DNS settings, add:

| Type  | Host | Target / Value        |
|-------|------|------------------------|
| CNAME | app  | cname.vercel-dns.com   |

Vercel will automatically provision SSL. Propagation can take a few minutes to 48 hours.

## Project Structure

```
src/
├── app/
│   ├── (app)/              # App shell (sidebar + topbar)
│   │   ├── page.tsx        # Dashboard
│   │   ├── estimates/      # Estimates module
│   │   │   ├── page.tsx    # List
│   │   │   ├── new/        # Create
│   │   │   └── [id]/       # Detail/Edit
│   │   └── layout.tsx
│   ├── api/estimates/      # CRUD API
│   ├── login/              # Auth placeholder
│   └── layout.tsx
├── components/
│   ├── layout/
│   └── ui/                 # shadcn components
└── lib/
    ├── types.ts
    ├── format.ts
    ├── estimateUtils.ts
    └── estimatesStore.ts   # MVP in-memory storage
```

## MVP Data Storage

Estimates are stored **in-memory** on the server. Data is lost on restart. For production, replace `estimatesStore.ts` with a database (e.g. PostgreSQL, Supabase).
