// index.js - Home page logic for Platillos

$(document).ready(async function() {
    await session.ready();
    $('#dishes-list-container').load('/dish-list');
});
