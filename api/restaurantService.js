var db = require('../connections');
var axios = require('axios');
var config = require('../config');

var allowedFields = [
    'restaurantId',
    'name',
    'cityId',
    'address',
    'zip',
    'lat',
    'lng',
    'submitted',
    'submittedBy',
    'coords',
    'status',
    'statusUpdated',
    'statusUpdatedBy'
];

async function getRestaurants(params) {
    var selectFields;
    if (params.fields) {
        selectFields = params.fields.filter(function(field) {
            return allowedFields.includes(field);
        });
    }

    var useLocation = params.useLocation == '1';
    var lat, lng;
    var selectClause = '';
    var vals = [];

    if (!selectFields || !selectFields.length) {
        selectClause = 'r.*';
    } else {
        selectClause = selectFields.map(function(field) {
            return 'r.' + field;
        }).join(', ');
    }

    selectClause += ', c.city as cityName';

    if (useLocation) {
        if (params.lat && params.lng) {
            lat = parseFloat(params.lat); // latitude
            lng = parseFloat(params.lng); // longitude
        } else if (params.auth?.user?.addressLat && params.auth?.user?.addressLng) {
            lat = parseFloat(params.auth.user.addressLat);
            lng = parseFloat(params.auth.user.addressLng);
        }
        if (lat && lng) {
            selectClause += (selectClause ? ', ' : '') + 'ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) as distance';
            vals.push('POINT(' + lat + ' ' + lng + ')');
        }
    }

    var sql = 'SELECT ' + selectClause + ' FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId WHERE 1=1';

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        sql += " AND r.status = 'pending'";
    } else if (!isAdmin) {
        sql += " AND r.status = 'approved'";
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        sql += ' AND r.status = ?';
        vals.push(statusFilter);
    }

    if (params.restaurantId) {
        sql += ' AND r.restaurantId = ?';
        vals.push(params.restaurantId);
    }

    var take = 10;
    var skip = 0;

    if (params.prefix) {
        sql += ' AND r.name LIKE ?';
        vals.push(params.prefix + '%');
    }

    if (useLocation && lat && lng) {
        sql += ' ORDER BY distance ASC';
    }

    if (params.pageSize) {
        var parsedPageSize = parseInt(params.pageSize, 10);
        if (!isNaN(parsedPageSize) && parsedPageSize > 0) {
            take = parsedPageSize;
        }
    }

    if (params.page) {
        var parsedPage = parseInt(params.page, 10);
        if (!isNaN(parsedPage) && parsedPage > 0) {
            skip = (parsedPage - 1) * take;
        }
    }

    if (params.take) {
        var parsedTake = parseInt(params.take, 10);
        if (!isNaN(parsedTake) && parsedTake > 0) {
            take = parsedTake;
        }
    }

    if (params.skip) {
        var parsedSkip = parseInt(params.skip, 10);
        if (!isNaN(parsedSkip) && parsedSkip >= 0) {
            skip = parsedSkip;
        }
    }

    sql += ' LIMIT ? OFFSET ?';
    vals.push(take, skip);

    var rows = await db.query(sql, vals);
    return rows;
}

async function getRestaurant(params) {
    if (!params || !params.restaurantId) {
        return null;
    }

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var sql = 'SELECT r.*, c.city as cityName FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId WHERE r.restaurantId = ?';
    var vals = [params.restaurantId];

    if (!isAdmin) {
        sql += " AND r.status = 'approved'";
    }

    var rows = await db.query(sql, vals);
    return rows && rows.length ? rows[0] : null;
}

async function updateRestaurantLatLngFromGeocode() {
    var rows = await db.query('SELECT restaurantId, address, cityId, zip, lat, lng FROM restaurants');
    for (var i = 0; i < rows.length; i++) {
        var restaurant = rows[i];
        if (restaurant.lat && restaurant.lng) continue;

        var addressParts = [restaurant.address];
        if (restaurant.zip) addressParts.push(restaurant.zip);
        // Optionally join with city name if available
        var cityRows = await db.query('SELECT city FROM cities WHERE cityId = ?', [restaurant.cityId]);
        if (cityRows.length) addressParts.push(cityRows[0].city);

        var fullAddress = addressParts.join(', ');
        var url = 'https://maps.googleapis.com/maps/api/geocode/json';
        var params = {
            address: fullAddress,
            key: config.googleMapsKey
        };

        try {
            var res = await axios.get(url, { params: params });
            if (res.data && res.data.results && res.data.results.length) {
                var location = res.data.results[0].geometry.location;
                await db.query(
                    'UPDATE restaurants SET lat = ?, lng = ? WHERE restaurantId = ?',
                    [location.lat, location.lng, restaurant.restaurantId]
                );
            }
        } catch (err) {
            // skip on error
        }
    }
}

module.exports = {
    getRestaurants: getRestaurants,
    getRestaurant: getRestaurant,
    updateRestaurantLatLngFromGeocode: updateRestaurantLatLngFromGeocode
};
//updateRestaurantLatLngFromGeocode()