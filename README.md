# Platillos

Platillos is a community app for reviewing individual dishes, rather than whole
restaurants. People can discover food nearby, keep a tasting diary, share photos,
follow other reviewers, and save dishes they want to try.

The app uses Express and Handlebars, MySQL 8, and browser JavaScript with jQuery.
Images are stored in S3. AI-assisted moderation checks new listings against cited
sources; low-confidence decisions go to a human moderator. Photo framing keeps
the original image and generates subject-aware display variants.

## Run locally

Use Node.js 22 and MySQL 8. The unit and HTTP tests run without a database, AWS
credentials, or API keys.

```bash
nvm use
npm ci
npm run test:ci
cp .env.example .env
```

Set `cookieSecret` to a random value, for example one generated with
`openssl rand -hex 32`. Set `dbUrl`, `dbUser`, `dbPassword`, and `database` for your
own development database. For a local MySQL server without TLS, set `dbSsl=false`.
For a remote database, configure TLS and the appropriate CA certificate.

Create an empty database, then load the current schema:

```bash
mysql -u YOUR_USER -p -e 'CREATE DATABASE platillos_qa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
mysql -u YOUR_USER -p platillos_qa < db/schema.sql
npm start
```

Open <http://localhost:3000>. The database starts empty. `db/schema.sql` is for new
installations; the numbered SQL files describe historical changes and should not
be replayed on top of it. Existing installations can apply
`db/11_decimal_ratings.sql` to preserve the fractional ratings accepted by the API. Database schema export is an explicit operation:
`node db/export-ddl.js`.

Optional services:

- Registration requires a reCAPTCHA site key (`recaptchaSiteKey`) and server secret
  (`recaptchaKey`). They must belong to the same reCAPTCHA configuration.
- Browser address lookup uses `googleMapsBrowserKey`; server-side geocoding uses
  `googleMapsKey`. Restrict the browser key by HTTP referrer and the server key by
  its permitted API and deployment environment.
- Photo upload requires an S3 bucket and an AWS identity allowed to write to it.
  Use the SDK credential chain (`AWS_PROFILE` locally or an IAM role in Lambda).
- AI features require `OPENAI_API_KEY`; restaurant discovery also uses
  `perplexityKey`. `aiModel` and `aiConfidenceThreshold` configure moderation.

`.env` and `env/` are ignored. `.env.example` contains configuration names only.
The certificate in `certs/` is a public AWS RDS certificate authority bundle.

## Code layout

- `app.js`: middleware, session loading, explicit page routes, and error handling.
- `api/`: resource routes and services containing queries and business rules.
- `views/`, `public/`: templates, page scripts, and styles.
- `ai/`: search, moderation, discovery, and image framing.
- `aiJobQueue.js`: persistent jobs, retries, and reconciliation.
- `db/schema.sql`: the current schema for a fresh database.
- `tests/`: service tests and HTTP security/contract tests with mocked services.

[API reference](docs/api.md) describes routes, authentication, and status codes.
HTTP routes validate external input; services use the known MySQL result shape.
Authentication comes from signed session cookies and is kept separate from
request data. Queries bind values, and moderators can change approval state.
Shared browser output encoding escapes user text for quoted HTML attributes as
well as text content.

## Checks and deployment

```bash
npm run test:ci
npm audit
```

GitHub Actions runs the tests, dependency audit, and a Gitleaks history scan.
For a local history scan, install Gitleaks and run `gitleaks git . --redact`.
The `js-yaml` override keeps Jest's configuration reader on the patched v4 API;
its caller uses the compatible `load()` function.

`npm run test:qa` and `npm run test:browser` run integration checks against your
configured QA database and create temporary fixtures. The browser check also
requires `npx playwright install chromium`. These checks are separate from the
credential-free unit suite.

`lambda.js` adapts Express to API Gateway and processes scheduled AI jobs. A
scheduled EventBridge invocation runs the queue. To configure Claudia, copy
`claudia.example.json` to the ignored `claudia.json` and supply your own API ID.
`scripts/build-release.sh` packages committed runtime files into an archive;
`deploy-prod.sh` performs an explicit deployment using your AWS credential chain.

## License

[ISC](LICENSE).
