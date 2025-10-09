# platillos

## Optional production environment

Sensitive production credentials are stored in `env/.env.production` for local debugging against the live database. To use them temporarily, source the file in your shell before starting the app:

```bash
source env/.env.production
npm start
```

Be sure to keep this file out of version control and clear the environment when you are done:

```bash
unset awsAccessKey awsSecretKey cookieSecret dbPassword dbUrl dbUser env awsRegion
```
