// footer.js - Handles footer interactions

var footerModule = {
    setHandlers: function() {
        $('.footer-plus-btn').on('click', async function(event) {
            common.showModal('/add-review');
        });
    }
};

$(document).ready(function() {
    footerModule.setHandlers();
});

window.footerModule = footerModule;
