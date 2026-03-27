'use strict'
const awsServerlessExpress = require('aws-serverless-express')
const app = require('./app')
const aiJobQueue = require('./aiJobQueue')
const binaryMimeTypes = [
	'application/octet-stream',
	'font/eot',
	'font/opentype',
	'font/otf',
	'image/jpeg',
	'image/png',
	'image/svg+xml'
]
const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);
exports.handler = async (event, context) => {
	// CloudWatch scheduled event — process AI job queue
	if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
		console.log('[ai-jobs] Scheduled trigger received');
		try {
			var result = await aiJobQueue.processJobs(10);
			console.log('[ai-jobs] Done:', JSON.stringify(result));
			return { statusCode: 200, body: JSON.stringify(result) };
		} catch (err) {
			console.error('[ai-jobs] Error:', err.message || err);
			return { statusCode: 500, body: err.message };
		}
	}

	// Normal API Gateway request
	return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
}
