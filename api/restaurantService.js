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
    params = params || {};

    var selectFields;
    if (params.fields) {
        selectFields = params.fields.filter(function(field) {
            return allowedFields.includes(field);
        });
    }

    var useLocation = params.useLocation == '1';
    var lat, lng;
    var selectClause;
    if (!selectFields || !selectFields.length) {
        selectClause = 'r.*';
    } else {
        selectClause = selectFields.map(function(field) {
            return 'r.' + field;
        }).join(', ');
    }

    selectClause += ', c.city as cityName';

    var selectExtra = '';
    var selectExtraValues = [];

    if (useLocation) {
        if (params.lat && params.lng) {
            lat = parseFloat(params.lat); // latitude
            lng = parseFloat(params.lng); // longitude
        } else if (params.auth?.user?.addressLat && params.auth?.user?.addressLng) {
            lat = parseFloat(params.auth.user.addressLat);
            lng = parseFloat(params.auth.user.addressLng);
        }
        if (lat && lng) {
            selectExtra = ', ST_Distance_Sphere(coords, ST_GeomFromText(?, 4326)) as distance';
            selectExtraValues.push('POINT(' + lat + ' ' + lng + ')');
        }
    }

    var fromClause = ' FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId';
    var whereClauses = ['1=1'];
    var whereValues = [];

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var shouldFilterPending = String(params.pending) === '1' || statusFilter === 'pending';

    if (shouldFilterPending) {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("r.status = 'pending'");
    } else if (!isAdmin) {
        whereClauses.push("r.status = 'approved'");
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        whereClauses.push('r.status = ?');
        whereValues.push(statusFilter);
    }

    if (params.restaurantId) {
        whereClauses.push('r.restaurantId = ?');
        whereValues.push(params.restaurantId);
    }

    if (params.prefix) {
        whereClauses.push('r.name LIKE ?');
        whereValues.push(params.prefix + '%');
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues) || [];
    var total = countRows.length ? countRows[0].total : 0;

    var take = parseInt(params.pageSize, 10) || 10;
    var page = parseInt(params.page, 10) || 1;
    if (page < 1) page = 1;
    var skip = (page - 1) * take;

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

    var orderClause = '';
    if (useLocation && lat && lng) {
        orderClause = ' ORDER BY distance ASC';
    }

    var dataSql = 'SELECT ' + selectClause + selectExtra + fromClause + whereSql + orderClause + ' LIMIT ? OFFSET ?';
    var dataValues = [];
    if (selectFields && selectFields.length) {
        dataValues = dataValues.concat(selectFields);
    }
    dataValues = dataValues.concat(selectExtraValues, whereValues, [take, skip]);

    var rows = await db.query(dataSql, dataValues) || [];

    return {
        rows: rows,
        total: total
    };
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