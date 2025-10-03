var approveDishModule = {
    metadataOptions: null,
    isSaving: false,
    setHandlers: function() {
        $(document).ready(approveDishModule.init);
        $(document).on('click', '#save-dish-status-btn', approveDishModule.handleSave);
        $(document).on('click', '#approve-dish-content .metadata-chip', approveDishModule.handleChipToggle);
    },
    init: function() {
        approveDishModule.renderDishLoading();
        approveDishModule.loadDish();
    },
    renderDishLoading: function() {
        $('#approve-dish-name').text('Loading...');
        $('#approve-dish-restaurant').text('');
        $('#approve-dish-submitted').text('');
        approveDishModule.showMetadataError('');
    },
    ensureMetadataOptions: async function() {
        if (approveDishModule.metadataOptions) {
            return approveDishModule.metadataOptions;
        }
        var res = await $.get('/api/dishes/metadata/options');
        if (!res || !res.success) {
            throw new Error((res && res.message) || 'Failed to load metadata options');
        }
        approveDishModule.metadataOptions = res.data || { categories: [], dishTypes: [], tags: [] };
        return approveDishModule.metadataOptions;
    },
    loadDish: async function() {
        var dishId = window.approveDishId;
        if (!dishId) {
            $('#approve-dish-content').text('Missing dishId.');
            return;
        }

        var metadataLoaded = true;
        var metadataOptions = null;
        try {
            metadataOptions = await approveDishModule.ensureMetadataOptions();
            approveDishModule.populateMetadataChips(metadataOptions);
            approveDishModule.showMetadataError('');
        } catch (err) {
            metadataLoaded = false;
            approveDishModule.populateMetadataChips({ categories: [], dishTypes: [], tags: [] });
            approveDishModule.showMetadataError('Metadata options unavailable. You can still update the status.');
        }

        try {
            var res = await $.get('/api/dishes/' + encodeURIComponent(dishId));
            var dish = res && res.data ? res.data : null;
            if (!dish) {
                $('#approve-dish-content').text('Dish not found.');
                return;
            }

            approveDishModule.renderDishInfo(dish);

            var currentStatus = (dish.status || 'pending').toLowerCase();
            if (!['pending', 'approved', 'rejected'].includes(currentStatus)) {
                currentStatus = 'pending';
            }
            $('#dish-status-select').val(currentStatus);

            if (metadataLoaded && metadataOptions) {
                approveDishModule.applyMetadataSelections(dish);
            } else if (dish && (dish.categories || dish.dishTypes || dish.tags)) {
                approveDishModule.showMetadataError('Metadata options unavailable. Existing selections are not displayed.');
            }
        } catch (err) {
            $('#approve-dish-content').text('Failed to load dish.');
        }
    },
    renderDishInfo: function(dish) {
        $('#approve-dish-name').text(dish.name || '');
        $('#approve-dish-restaurant').text(dish.restaurantName || '');
        var submittedText = '';
        if (dish.submitted) {
            try {
                submittedText = new Date(dish.submitted).toLocaleString();
            } catch (err) {
                submittedText = '';
            }
        }
        $('#approve-dish-submitted').text(submittedText || '');
    },
    populateMetadataChips: function(options) {
        approveDishModule.renderChipList('#dish-categories-chips', options.categories, 'categoryId', 'category');
        approveDishModule.renderChipList('#dish-types-chips', options.dishTypes, 'dishTypeId', 'dishType');
        approveDishModule.renderChipList('#dish-tags-chips', options.tags, 'tagId', 'tag');
    },
    renderChipList: function(selector, items, valueKey, labelKey) {
        var $container = $(selector);
        if (!$container.length) {
            return;
        }
        $container.empty();
        if (!items || !items.length) {
            $container.append('<div class="metadata-chip-empty">No options available</div>');
            return;
        }
        items.forEach(function(item) {
            var value = item[valueKey];
            if (value === undefined || value === null) {
                return;
            }
            var label = item[labelKey] || value;
            var $chip = $('<button type="button" class="metadata-chip" role="option" aria-selected="false"></button>');
            $chip.attr('data-value', value);
            $chip.text(label);
            $container.append($chip);
        });
    },
    applyMetadataSelections: function(dish) {
        approveDishModule.setChipSelections('#dish-categories-chips', dish.categories, 'categoryId');
        approveDishModule.setChipSelections('#dish-types-chips', dish.dishTypes, 'dishTypeId');
        approveDishModule.setChipSelections('#dish-tags-chips', dish.tags, 'tagId');
    },
    setChipSelections: function(selector, items, key) {
        var $container = $(selector);
        if (!$container.length) {
            return;
        }
        var selectedIds = [];
        if (items && items.length) {
            selectedIds = items.map(function(item) {
                return String(item[key]);
            });
        }
        $container.find('.metadata-chip').each(function() {
            var $chip = $(this);
            var value = String($chip.attr('data-value'));
            var isSelected = selectedIds.indexOf(value) !== -1;
            $chip.toggleClass('is-selected', isSelected);
            $chip.attr('aria-selected', isSelected ? 'true' : 'false');
        });
    },
    showMetadataError: function(message) {
        $('#metadata-error').text(message || '');
    },
    handleChipToggle: function(event) {
        var $chip = $(event.currentTarget);
        if ($chip.hasClass('metadata-chip-disabled')) {
            return;
        }
        var isSelected = $chip.hasClass('is-selected');
        $chip.toggleClass('is-selected', !isSelected);
        $chip.attr('aria-selected', !isSelected ? 'true' : 'false');
    },
    getSelectedIdsFromChips: function(selector) {
        var $container = $(selector);
        if (!$container.length) {
            return undefined;
        }
        var ids = [];
        $container.find('.metadata-chip.is-selected').each(function() {
            var value = $(this).attr('data-value');
            var num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
                ids.push(num);
            }
        });
        return ids;
    },
    handleSave: async function(e) {
        e.preventDefault();
        if (approveDishModule.isSaving) {
            return;
        }

        var dishId = window.approveDishId;
        if (!dishId) {
            common.showAlert('Missing dishId.', 'error');
            return;
        }

        var status = $('#dish-status-select').val();
        var normalizedStatus = (status || '').toLowerCase();
        if (!['approved', 'rejected', 'pending'].includes(normalizedStatus)) {
            common.showAlert('Please select a valid status.', 'error');
            return;
        }

        var payload = {
            status: normalizedStatus
        };
        var categories = approveDishModule.getSelectedIdsFromChips('#dish-categories-chips');
        if (categories !== undefined) {
            payload.categories = categories;
        }
        var dishTypes = approveDishModule.getSelectedIdsFromChips('#dish-types-chips');
        if (dishTypes !== undefined) {
            payload.dishTypes = dishTypes;
        }
        var tags = approveDishModule.getSelectedIdsFromChips('#dish-tags-chips');
        if (tags !== undefined) {
            payload.tags = tags;
        }

        var $btn = $('#save-dish-status-btn');
        approveDishModule.isSaving = true;
        var originalText = $btn.text();
        $btn.text('Saving...');
        $btn.prop('disabled', true);

        try {
            var res = await $.ajax({
                url: '/api/dishes/' + encodeURIComponent(dishId),
                method: 'PATCH',
                dataType: 'json',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify(payload)
            });
            if (res && res.success) {
                var message = (res && res.message) || ('Dish ' + normalizedStatus + '.');
                common.showAlert(message, 'success');
                $('#approve-dish-modal').addClass('hidden');
                $('.overlay').addClass('hidden');
                if (window.approvalsModule && approvalsModule.initDishesGrid) {
                    $('#dishes-grid').empty();
                    approvalsModule.initDishesGrid();
                }
            } else {
                common.showAlert((res && res.message) || 'Failed to update dish.', 'error');
            }
        } catch (err) {
            common.showAlert('Failed to update dish.', 'error');
        } finally {
            approveDishModule.isSaving = false;
            $btn.text(originalText);
            $btn.prop('disabled', false);
        }
    }
};

$(document).ready(function() { approveDishModule.setHandlers(); });

window.approveDishModule = approveDishModule;

//# sourceURL=approve-dish.js
