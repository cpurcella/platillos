# platillos

## Getting started

1. Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

2. Install dependencies and start the server:

```bash
npm install
npm start
```

## Environment configuration

All secrets and environment-specific values are loaded from environment variables via a `.env` file (local dev) or the deployment environment (production/Lambda).

- `.env` — local development secrets (gitignored, never committed)
- `.env.example` — template showing required variables
- `env/.env.production` — optional production overrides for local debugging (gitignored)

To temporarily run against the production database, source the production file first:

```bash
source env/.env.production
npm start
```

Clear the environment when you are done:

```bash
unset awsAccessKey awsSecretKey cookieSecret dbPassword dbUrl dbUser env awsRegion openAiApiKey
```

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
