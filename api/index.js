var express = require('express');
var router = express.Router();

router.use('/users', require('./users'));
router.use('/restaurants', require('./restaurants'));
router.use('/dishes', require('./dishes'));
router.use('/auth', require('./auth'));
router.use('/files', require('./files'));
router.use('/reviews', require('./reviews'));
router.use('/review-photos', require('./reviewPhotos'));
router.use('/approvals', require('./approvals'));

module.exports = router;
