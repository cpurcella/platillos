var restaurantAi = require('../ai/restaurants');

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

describe('ai/restaurants verification instructions', function() {
    test('allows corroborated third-party evidence for sparse local restaurants', function() {
        var instructions = restaurantAi.buildRestaurantInstructions();

        expect(instructions).toContain('Do not require an official website');
        expect(instructions).toContain('Credible third-party evidence can include');
        expect(instructions).toContain('delivery platforms');
        expect(instructions).toContain('map or local directories');
        expect(instructions).toContain('gift-card or listing pages');
        expect(instructions).toContain('active social listings');
    });

    test('defines approval threshold for independent listings or matching details', function() {
        var instructions = restaurantAi.buildRestaurantInstructions();

        expect(instructions).toContain('at least two credible independent third-party listings');
        expect(instructions).toContain('one credible listing is supported by matching address, phone, menu, or delivery evidence');
    });

    test('uses manual review instead of rejection for sparse plausible evidence', function() {
        var instructions = restaurantAi.buildRestaurantInstructions();

        expect(instructions).toContain('If evidence is sparse but plausible');
        expect(instructions).toContain('set verdict to manual_review instead of reject');
        expect(instructions).toContain('Never reject because no credible evidence was found');
    });

    test('tells the model to search flexible local and Spanish variants', function() {
        var instructions = restaurantAi.buildRestaurantInstructions();
        var prompt = restaurantAi.buildUserPrompt([{
            restaurantId: 'restaurant-1',
            name: 'La Rosita de Durango',
            address: '5201 Central Ave NE',
            city: 'Albuquerque',
            zip: '87108',
            lat: 0,
            lng: 0
        }]);

        expect(instructions).toContain('try alternate capitalization, punctuation, accents, and spacing');
        expect(instructions).toContain('variants such as "de" versus "De"');
        expect(instructions).toContain('taqueria');
        expect(instructions).toContain('food truck');
        expect(prompt).toContain('Search for alternate spellings, capitalization, Spanish terms');
        expect(prompt).toContain('Coordinates: MISSING');
    });

    test('anchors verification to Albuquerque, NM instead of similarly named restaurants elsewhere', function() {
        var instructions = restaurantAi.buildRestaurantInstructions();
        var prompt = restaurantAi.buildUserPrompt([{
            restaurantId: 'restaurant-2',
            name: 'Seared',
            address: '',
            city: '',
            zip: '',
            lat: 0,
            lng: 0
        }]);

        expect(instructions).toContain('Albuquerque, New Mexico only');
        expect(instructions).toContain('Always look for the submitted restaurant in Albuquerque, NM');
        expect(instructions).toContain('outside Albuquerque, NM');
        expect(prompt).toContain('Platillos is currently limited to restaurants in Albuquerque, New Mexico');
        expect(prompt).toContain('search for the restaurant in Albuquerque, NM first');
        expect(prompt).toContain('Search for alternate spellings, capitalization, Spanish terms, and the name with Albuquerque, NM');
    });
});
