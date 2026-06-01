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
		var results = {};

		// Always process the job queue
		console.log('[ai-jobs] Scheduled trigger received');
		try {
			results.jobs = await aiJobQueue.processJobs(10);
			console.log('[ai-jobs] Done:', JSON.stringify(results.jobs));
		} catch (err) {
			console.error('[ai-jobs] Error:', err.message || err);
			results.jobsError = err.message;
		}

		// Reconcile orphaned pending items that have no job in the queue
		try {
			results.reconcile = await aiJobQueue.reconcileOrphans();
			if (results.reconcile.enqueued > 0) {
				console.log('[ai-jobs] Reconciled orphans:', JSON.stringify(results.reconcile));
			}
		} catch (err) {
			console.error('[ai-jobs] Reconcile error:', err.message || err);
			results.reconcileError = err.message;
		}

		// Vector store refresh — runs when event has refreshVectorStore flag
		if (event.refreshVectorStore) {
			var metros = event.metros || ['Albuquerque'];
			console.log('[ai-vector-store] Refreshing vector store for metros:', metros);
			try {
				var vectorStore = require('./ai/vectorStore');
				results.vectorStore = await vectorStore.refreshVectorStore(metros);
				console.log('[ai-vector-store] Done:', JSON.stringify(results.vectorStore));
			} catch (err) {
				console.error('[ai-vector-store] Error:', err.message || err);
				results.vectorStoreError = err.message;
			}
		}

		// Restaurant discovery — runs when event has discovery flag
		if (event.discovery) {
			var metro = event.metro || 'Albuquerque, New Mexico';
			console.log('[ai-discovery] Starting restaurant discovery for ' + metro);
			try {
				var discovery = require('./ai/discovery');
				results.discovery = await discovery.discoverRestaurants({ metro: metro });
				console.log('[ai-discovery] Done:', JSON.stringify(results.discovery));
			} catch (err) {
				console.error('[ai-discovery] Error:', err.message || err);
				results.discoveryError = err.message;
			}
		}

		return { statusCode: 200, body: JSON.stringify(results) };
	}

	// Normal API Gateway request
	return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
}
