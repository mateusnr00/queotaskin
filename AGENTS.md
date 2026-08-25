<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Auto-deploy

After finishing any task that produces commits on a `claude/*` branch:
commit → push → open a PR against `main` → merge it (method: `merge`).
Don't ask for permission before merging — the user has standing authorization.
Vercel auto-deploys `main` to production and runs `prisma migrate deploy`
in the build step, so a merge is the deploy.
