# drieEV landing page

Static “Launching soon” site for [drieEv.com](https://drieEv.com).

## Preview locally

```bash
cd landing
npx --yes serve . -p 4320
```

Open http://localhost:4320

## Deploy to drieEv.com

Upload the contents of this folder (`index.html`, `styles.css`, `favicon.svg`) to any static host.

### Cloudflare Pages

1. Create a project → **Direct Upload** or connect this repo.
2. Build command: *(none)*
3. Output directory: `landing`
4. Add custom domain **drieEv.com** in Pages → Custom domains.

### Vercel / Netlify

- **Root directory:** `landing`
- **Build command:** leave empty
- **Publish directory:** `.` (or `landing` if deploying from repo root with path set)

### DNS

Point your registrar to the host:

| Record | Value |
|--------|--------|
| `A` / `CNAME` | As provided by Cloudflare, Vercel, or Netlify |

When the full app launches, point `app.drieEv.com` (or the apex) at the Next.js deployment and keep this page on the root or swap the DNS target.
