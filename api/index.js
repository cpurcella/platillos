var express = require('express');
var router = express.Router();

router.use('/users', require('./users'));
router.use('/restaurants', require('./restaurants'));
router.use('/dishes', require('./dishes'));
router.use('/session', require('./session'));
router.use('/files', require('./files'));
router.use('/reviews', require('./reviews'));
router.use('/review-photos', require('./reviewPhotos'));

router.use(function(req, res) {
    res.status(404).json({ success: false, message: 'API resource not found' });
});

module.exports = router;
