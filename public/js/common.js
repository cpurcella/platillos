// common.js - Utility functions for Platillos

var common = (function() {
    function isUnsafeMethod(method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase());
    }

    function isSameOrigin(url) {
        if (!url || url.charAt(0) === '/') return true;
        var parsed = document.createElement('a');
        parsed.href = url;
        return parsed.protocol === window.location.protocol && parsed.host === window.location.host;
    }

    function getCsrfToken() {
        return $('meta[name="csrf-token"]').attr('content') || '';
    }

    $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
        if (isUnsafeMethod(options.type || options.method) && isSameOrigin(options.url)) {
            var token = getCsrfToken();
            if (token) {
                jqXHR.setRequestHeader('X-CSRF-Token', token);
            }
        }
    });

    function showAlert(message, type) {
        var $alert = $('<div class="alert"></div>').addClass(type || 'info').text(message);
        $('body').prepend($alert);
        setTimeout(function() { $alert.fadeOut(400, function() { $alert.remove(); }); }, 3000);
    }

    function tooltip(text) {
        return '<span class="tooltip" tabindex="0"><span class="tooltip-icon" aria-label="More info" role="img">?</span><span class="tooltip-content">' + text + '</span></span>';
    }

    function showLoading() {
        if ($('#loading-overlay').length) return;
        var $overlay = $('<div id="loading-overlay"></div>');
        var $spinner = $('<div class="loading-spinner" aria-label="Loading" role="status"></div>');
        $overlay.append($spinner);
        $('body').append($overlay);
    }

    function hideLoading() {
        $('#loading-overlay').fadeOut(200, function() { $(this).remove(); });
    }

    function setLoading() {
        $(document).ajaxStart(showLoading);
        $(document).ajaxStop(hideLoading);
    }

    function formatPhone(value) {
        var digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return '(' + digits.slice(0,3) + ') ' + digits.slice(3);
        return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6,10);
    }

    function setPhoneFormatHandler() {
        $('input[type="tel"]').on('input', function() {
            var val = $(this).val();
            var formatted = formatPhone(val);
            $(this).val(formatted);
        });
    }

    // Extend jQuery's serializeArray to handle checkboxes, skip confirmation fields, and return an object
    var _oldSerializeArray = $.fn.serializeArray;
    $.fn.serializeObject = function() {
        var arr = _oldSerializeArray.call(this);
        var obj = {};
        for (var i = 0; i < arr.length; i++) {
            var name = arr[i].name;
            var $input = this.find('[name="' + name + '"]');
            if (name.startsWith('confirm')) continue;
            if ($input.attr('type') === 'checkbox') {
                obj[name] = $input.prop('checked') ? 1 : 0;
            } else {
                obj[name] = arr[i].value;
            }
        }
        return obj;
    };



    function showModal(templatePath) {
        $.get(templatePath, function(html) {
            $('.modal').remove();
            $('.overlay').remove();
            $('body').append(html);
            $('.modal').removeClass('hidden').show();
            $('.overlay').removeClass('hidden').show();
        });
    }

    function tabsClick(e) {
        e.preventDefault();
        var $link = $(this);
        var $tabs = $link.parent();
        var index = $tabs.children('a').index($link);
        var $container = $tabs.next('.tab-panels');
        if (!$container.length) {
            $container = $tabs.parent().find('.tab-panels').first();
        }
        var $links = $tabs.children('a');
        var $panels = $container.children('.tab-content');
        $links.removeClass('active');
        $link.addClass('active');
        $panels.hide().removeClass('active').eq(index).addClass('active').show();
    }

    function initTabs() {
        $('.tabs').each(function() {
            var $tabs = $(this);
            var $links = $tabs.children('a');
            if (!$links.length) return;
            $links.off('click.commonTabs').on('click.commonTabs', tabsClick);
            if (!$links.filter('.active').length) {
                $links.removeClass('active').eq(0).addClass('active');
            }
            var activeIndex = $links.index($tabs.find('a.active').eq(0));
            if (activeIndex < 0) activeIndex = 0;
            var $container = $tabs.next('.tab-panels');
            if (!$container.length) {
                $container = $tabs.parent().find('.tab-panels').first();
            }
            var $panels = $container.children('.tab-content');
            $panels.hide().removeClass('active').eq(activeIndex).addClass('active').show();
        });
    }

    function setHandlers() {
        setLoading();
        setPhoneFormatHandler();
        initTabs();
    }

    $(document).ready(function() {
        setHandlers();
    });
    $(document).on('click', '.close-modal', function() {
        var $modal = $(this).closest('.modal');
        $modal.addClass('closing');
        $('.overlay').addClass('hidden');
        setTimeout(function() {
            $modal.addClass('hidden').removeClass('closing');
        }, 350); // Match the animation duration
    });
    return {
        showAlert: showAlert,
        tooltip: tooltip,
        showModal: showModal,
        setHandlers: setHandlers
    };
})();
