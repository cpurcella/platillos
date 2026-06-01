var db = require('../connections');
var dishAi = require('../ai/dishes');

jest.mock('../connections', function() {
    return {
        query: jest.fn(),
        getConnection: jest.fn()
    };
});

jest.mock('../config', function() {
    return {
        aiConfidenceThreshold: 0.8,
        aiModel: 'test-model'
    };
});

function createConnection() {
    return {
        beginTransaction: jest.fn().mockResolvedValue(),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };
}

describe('ai/dishes metadata suggestions', function() {
    beforeEach(function() {
        jest.clearAllMocks();
    });

    test('dish prompt tells AI to suggest metadata coverage gaps separately', function() {
        var prompt = dishAi.buildDishPrompt({ dishId: 'dish-1', dishName: 'Patty Melt', restaurantName: 'Cafe' }, {
            categories: [{ category: 'Sandwich' }],
            dishTypes: [{ dishType: 'Burger' }],
            tags: [{ tag: 'spicy' }]
        }, []);

        expect(prompt).toContain('suggestedMetadata');
        expect(prompt).toContain('do not force a weak match');
        expect(prompt).toContain('missing cocktail style');
    });

    test('dish schema requires suggestedMetadata on each decision', function() {
        var schema = dishAi.buildDishJsonSchema().schema;
        var decisionSchema = schema.properties.decisions.items;

        expect(decisionSchema.required).toContain('suggestedMetadata');
        expect(decisionSchema.properties.suggestedMetadata.items.properties.type.enum).toEqual(['category', 'dishType', 'tag']);
    });

    test('normalizes valid suggestions and drops malformed ones', function() {
        var normalized = dishAi.normalizeDishDecision({
            dishId: 'dish-1',
            verdict: 'approve',
            confidence: 0.9,
            reasoning: 'Valid dish.',
            evidence: [],
            correctedName: null,
            concerns: [],
            categories: ['Sandwich'],
            dishTypes: ['Burger'],
            tags: ['spicy'],
            suggestedMetadata: [
                { type: 'tag', name: ' griddled ', justification: ' Useful preparation descriptor. ' },
                { type: 'dishType', name: 'Patty Melt', justification: 'Reusable sandwich style.' },
                { type: 'bad', name: 'Nope', justification: 'Invalid type.' },
                { type: 'tag', name: '', justification: 'Missing name.' }
            ]
        });

        expect(normalized.suggestedMetadata).toEqual([
            { type: 'tag', name: 'griddled', justification: 'Useful preparation descriptor.' },
            { type: 'dishType', name: 'Patty Melt', justification: 'Reusable sandwich style.' }
        ]);
    });

    test('applyDishDecisions stores matched metadata and pending suggestions separately', async function() {
        var connection = createConnection();
        connection.query
            .mockResolvedValueOnce([[{ dishId: 'dish-1', status: 'pending' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.getConnection.mockResolvedValue(connection);

        var result = await dishAi.applyDishDecisions([{
            dishId: 'dish-1',
            verdict: 'approve',
            confidence: 0.95,
            reasoning: 'Found on menu.',
            categories: ['Sandwich'],
            dishTypes: ['Burger'],
            tags: ['spicy'],
            suggestedMetadata: [
                { type: 'tag', name: 'griddled', justification: 'Useful preparation descriptor.' }
            ]
        }], {
            categories: [{ categoryId: 2, category: 'Sandwich' }],
            dishTypes: [{ dishTypeId: 3, dishType: 'Burger' }],
            tags: [{ tagId: 4, tag: 'spicy' }]
        });

        expect(result.updated).toBe(1);
        expect(connection.query.mock.calls[2][0]).toBe('INSERT IGNORE INTO dishes_categories (dishId, categoryId) VALUES ?');
        expect(connection.query.mock.calls[3][0]).toBe('INSERT IGNORE INTO dishes_dishTypes (dishId, dishTypeId) VALUES ?');
        expect(connection.query.mock.calls[4][0]).toBe('INSERT IGNORE INTO dishes_tags (dishId, tagId) VALUES ?');
        expect(connection.query.mock.calls[5][0]).toBe('INSERT IGNORE INTO aiMetadataSuggestions (dishId, metadataType, name, justification, status, createdAt) VALUES ?');
        expect(connection.query.mock.calls[5][1][0][0].slice(0, 5)).toEqual(['dish-1', 'tag', 'griddled', 'Useful preparation descriptor.', 'pending']);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});