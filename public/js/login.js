function setHandlers() {
    $('#loginForm').on('submit', onLoginSubmit);
}

async function onLoginSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var data = $(form).serializeObject();
    try {
        var res = await common.secureAjax({
            url: '/api/auth/authenticate',
            method: 'POST',
            dataType: 'json',
            data: data
        });
        window.location.href = res.redirect;
    } catch (err) {
        common.showAlert('Invalid email or password', 'error');
    }
}

$(document).ready(function() {
    setHandlers();
});
