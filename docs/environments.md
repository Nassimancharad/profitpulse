## ProfitPulse environments

### Overview
- Local/dev: use a local database or mocks.
- Staging: separate database, full TLS, safe for integration testing.
- Production: production database, strict TLS.

### Local
1) Create `.env.local`.
2) Use a local Postgres connection string, no TLS required.

Example:
```
DATABASE_URL=postgresql://postgres@localhost:5432/postgres?schema=public
```

### Staging and production
1) Create separate DBs for staging and production.
2) Set `DATABASE_URL` for each environment.
3) Provide the CA certificate via `DATABASE_SSL_CA`.

Example:
```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
DATABASE_SSL_CA="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

### Vercel setup
1) Add `DATABASE_URL` and `DATABASE_SSL_CA` in the Vercel project settings.
2) Set values separately for "Preview"/"Development" (staging) and "Production".
3) Keep `DATABASE_SSL_CA` out of the client bundle (server env only).

### Notes
- Do not disable TLS in staging/production.
- Keep staging/prod credentials separate from local.
