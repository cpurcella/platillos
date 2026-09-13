# platillos

## Getting started

Prerequisites:

- Node.js 22 (the production Lambda runtime)
- npm
- MySQL access for database-backed development

1. Select the project Node version and install dependencies:

```bash
nvm use
npm ci
```

2. Copy the example env file and fill in the development values:

```bash
cp .env.example .env
```

Use the `platillos_qa` schema for routine work. Keep production credentials out of
`.env`; if production debugging is unavoidable, put its values in the ignored
`env/.env.production` file and remove them when finished.

3. Run the test suite and start the server:

```bash
npm run test:ci
npm start
```

The app is available at <http://localhost:3000> by default.

## Environment configuration

All secrets and environment-specific values are loaded from environment variables via a `.env` file (local dev) or the deployment environment (production/Lambda).

- `.env` — local development secrets (gitignored, never committed)
- `.env.example` — template showing required variables
- `env/.env.production` — optional production overrides for local debugging (gitignored)

Database TLS is enabled in the example configuration and uses the checked-in AWS
RDS CA certificate at `certs/us-west-2-rds-ca-bundle.pem`.

For S3 access, prefer the AWS SDK's standard credential chain (for example, an
`AWS_PROFILE` backed by a narrowly scoped development identity). The legacy
`awsAccessKey` and `awsSecretKey` variables remain supported, but should not be
copied from production.

To temporarily run against the production database, source the production file first:

```bash
source env/.env.production
npm start
```

Clear the environment when you are done:

```bash
unset awsAccessKey awsSecretKey cookieSecret dbPassword dbUrl dbUser env awsRegion OPENAI_API_KEY
```

## Infrastructure notes

- Region: `us-west-2`
- Production runtime: Lambda alias `platillos:prod`, Node.js 22
- Production database: Lightsail database `platillos-external`, schema `prod`
- Development database: use schema `platillos_qa`
- Private VPC access: WireGuard network `10.105.105.0/24`

Do not commit WireGuard profiles, `.env` files, database passwords, API keys, or
AWS credentials.

## AI Job Queue

New submissions (restaurants, dishes, reviews, photos) are automatically enqueued in the `ai_jobs` table for AI evaluation. A CloudWatch EventBridge rule triggers the Lambda every 5 minutes to process pending jobs.

### Database migration

Run [db/06_add_ai_jobs.sql](db/06_add_ai_jobs.sql) against your MySQL database to create the `ai_jobs` table.

### CloudWatch EventBridge setup

Create a scheduled rule to invoke the Lambda every 5 minutes:

```bash
# Create the rule
aws events put-rule \
  --name platillos-ai-jobs \
  --schedule-expression "rate(5 minutes)" \
  --region us-west-2

# Add the Lambda as the target
aws events put-targets \
  --rule platillos-ai-jobs \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-west-2:YOUR_ACCOUNT_ID:function:platillos:prod" \
  --region us-west-2

# Grant EventBridge permission to invoke the Lambda
aws lambda add-permission \
  --function-name platillos:prod \
  --statement-id platillos-ai-jobs-invoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-west-2:YOUR_ACCOUNT_ID:rule/platillos-ai-jobs \
  --region us-west-2
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID. The `:prod` qualifier matches the Claudia deployment alias.
