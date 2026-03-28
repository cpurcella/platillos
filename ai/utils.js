var config = require('../config');

function formatDate(value) {
    if (!value) {
        return null;
    }
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

function extractJsonResult(response) {
    if (!response) {
        return null;
    }

    if (response.output) {
        for (var i = 0; i < response.output.length; i++) {
            var item = response.output[i];
            if (!item || !item.content) continue;
            for (var j = 0; j < item.content.length; j++) {
                var content = item.content[j];
                if (!content) continue;
                if (content.type === 'output_json' && content.json) {
                    return content.json;
                }
                if (content.type === 'text' && content.text) {
                    try {
                        return JSON.parse(content.text);
                    } catch (err) {
                        continue;
                    }
                }
            }
        }
    }

    if (response.output_text) {
        try {
            return JSON.parse(response.output_text);
        } catch (err) {
            return { parseError: err.message, raw: response.output_text };
        }
    }

    return null;
}

function resolveAiStatus(verdict, confidence) {
    var v = String(verdict || '').toLowerCase();
    var threshold = config.aiConfidenceThreshold;
    var conf = typeof confidence === 'number' ? confidence : 0;

    if (v === 'approve' && conf >= threshold) {
        return 'approved';
    } else if (v === 'reject' && conf >= threshold) {
        return 'rejected';
    } else {
        return 'needs_review';
    }
}

module.exports = {
    formatDate: formatDate,
    extractJsonResult: extractJsonResult,
    resolveAiStatus: resolveAiStatus
};
