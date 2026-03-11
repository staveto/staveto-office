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

## Google prihlásenie (Firebase)

1. Otvor [Firebase Console](https://console.firebase.google.com/) → projekt **staveto-mvp-5f251**
2. **Project Settings** (ikona ozubeného kolesa) → **Your apps** → **Add app** → **Web** (</>)
3. Skopíruj `firebaseConfig`, najmä `appId`
4. Vytvor `.env.local` (skopíruj z `.env.local.example`) a doplň:
   ```
   NEXT_PUBLIC_FIREBASE_APP_ID=1:255961550157:web:xxxxx
   ```
5. **Authentication** → **Sign-in method** → **Google** → zapni
6. **Authentication** → **Settings** → **Authorized domains** → pridaj:
   - `app.staveto.com`
   - `app.staveto.sk`
   - `localhost`

Pre Vercel: **Project Settings** → **Environment Variables** → pridaj `NEXT_PUBLIC_FIREBASE_APP_ID`.

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
