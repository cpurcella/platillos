// validate.js - Form validation for Platillos

var validate = (function() {
    var _validationRules = {
        required: function(input) {
            return $(input).val().trim() !== '';
        },
        confirm: function(input) {
            var partner = $('#' + $(input).data('confirm'));
            return partner.length && $(input).val() === partner.val();
        },
        email: function(input) {
            var val = $(input).val().trim();
            return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val);
        },
        tel: function(input) {
            var val = $(input).val().replace(/\D/g, '');
            return val.length === 10;
        },
        minDate: function(input) {
            var min = input.getAttribute('min');
            if (!min) return true;
            var val = $(input).val();
            if (!val) return true;
            return new Date(val) >= new Date(min);
        },
        maxDate: function(input) {
            var max = input.getAttribute('max');
            if (!max) return true;
            var val = $(input).val();
            if (!val) return true;
            return new Date(val) <= new Date(max);
        },
        minLength: function(input) {
            var min = input.getAttribute('minlength');
            if (!min) return true;
            var val = $(input).val();
            if (!val) return true;
            return val.length >= parseInt(min, 10);
        }
    };

    function validateInput(input) {
        var valid = true;
        var $input = $(input);
        var $group = $input.closest('.form-group');
        $group.find('.validation-note').remove();
        $input.removeClass('invalid');

        if (input.required && !_validationRules.required(input)) {
            valid = false;
            showValidation($input, 'This field is required.');
        }
        if ($input.data('confirm') && !_validationRules.confirm(input)) {
            valid = false;
            showValidation($input, 'Values do not match.');
        }
        if (input.type === 'email' && $input.val().trim() && !_validationRules.email(input)) {
            valid = false;
            showValidation($input, 'Please enter a valid email address.');
        }
        if (input.type === 'tel' && $input.val().trim() && !_validationRules.tel(input)) {
            valid = false;
            showValidation($input, 'Please enter a valid phone number.');
        }
        if (input.type === 'date' && !$input.hasClass('invalid') && !$input[0].validity.valueMissing && !_validationRules.minDate(input)) {
            valid = false;
            showValidation($input, 'You must be at least 13 years old.');
        }
        if (input.type === 'date' && !$input.hasClass('invalid') && !$input[0].validity.valueMissing && !_validationRules.maxDate(input)) {
            valid = false;
            showValidation($input, 'You must be at least 13 years old.');
        }
        if (input.type === 'password' && !$input.hasClass('invalid') && !$input[0].validity.valueMissing && !_validationRules.minLength(input)) {
            valid = false;
            showValidation($input, 'Password must be at least 10 characters.');
        }
        return valid;
    }

    function showValidation($input, message) {
        var $group = $input.closest('.form-group');
        $input.addClass('invalid');
        var $note = $('<div class="validation-note"></div>').text(message);
        $group.append($note);
    }

    function validateForm(form) {
        var valid = true;
        var $inputs = $(form).find('input');
        $inputs.each(function() {
            if (!validateInput(this)) valid = false;
        });
        return valid;
    }

    function setHandlers() {
        $('form').each(function() {
            $(this).find('input').on('blur', onInputBlur);
        });
    }

    function onInputBlur(e) {
        validateInput(e.target);
    }

    $(document).ready(setHandlers);
    return { validateForm: validateForm };
})();
