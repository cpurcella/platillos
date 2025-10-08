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

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending']);

function normalizeFieldSelection(rawFields) {
    if (rawFields === undefined || rawFields === null) {
        return [];
    }

    var parsed;

    if (typeof rawFields === 'string') {
        try {
            parsed = JSON.parse(rawFields);
        } catch (err) {
            parsed = rawFields.split(',');
        }
    } else if (Array.isArray(rawFields)) {
        parsed = rawFields;
    } else {
        parsed = [rawFields];
    }

    if (!Array.isArray(parsed)) {
        parsed = [parsed];
    }

    return parsed
        .map(function(field) {
            return typeof field === 'string' ? field.trim() : '';
        })
        .filter(function(field, index, arr) {
            return field && allowedFields.includes(field) && arr.indexOf(field) === index;
        });
}

function hasProp(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeString(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

function parseNullableFloat(value, fieldName) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    var num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) {
        var err = new Error('Invalid ' + fieldName);
        err.status = 400;
        throw err;
    }
    return num;
}

async function getOrCreateCityId(connection, cityName) {
    var name = normalizeString(cityName);
    if (!name) {
        return null;
    }

    var rows = await connection.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    if (rows && rows.length) {
        return rows[0].cityId;
    }

    var insertResult = await connection.query('INSERT INTO cities (city) VALUES (?)', [name]);
    if (Array.isArray(insertResult)) {
        return insertResult[0] && insertResult[0].insertId;
    }
    return insertResult.insertId;
}

function normalizeStatus(rawStatus) {
    if (rawStatus === undefined) {
        return undefined;
    }
    var status = String(rawStatus || '').toLowerCase();
    if (!VALID_STATUSES.has(status)) {
        var err = new Error('Invalid status');
        err.status = 400;
        throw err;
    }
    return status;
}

function resolveAuditColumns(status, userId) {
    if (status === undefined) {
        return [];
    }
    if (status === 'pending') {
        return [status, null, null];
    }
    var now = Date.now();
    return [status, now, userId || null];
}

async function getRestaurants(params) {
    params = params || {};

    var selectFields = normalizeFieldSelection(params.fields);
    var selectFieldArrayParams = normalizeFieldSelection(params['fields[]']);
    if (selectFieldArrayParams.length) {
        selectFieldArrayParams.forEach(function(field) {
            if (!selectFields.includes(field)) {
                selectFields.push(field);
            }
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

    if (statusFilter === 'pending') {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("r.status = 'pending'");
    } else if (statusFilter === 'approved' || statusFilter === 'rejected') {
        whereClauses.push('r.status = ?');
        whereValues.push(statusFilter);
    } else if (!isAdmin) {
        whereClauses.push("r.status = 'approved'");
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
    var dataValues = [].concat(selectExtraValues, whereValues, [take, skip]);

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

async function updateRestaurant(params) {
    params = params || {};

    var restaurantId = params.restaurantId;
    if (!restaurantId) {
        var missingErr = new Error('Missing restaurantId');
        missingErr.status = 400;
        throw missingErr;
    }

    var status = normalizeStatus(params.status);
    var hasName = hasProp(params, 'name');
    var hasAddress = hasProp(params, 'address');
    var hasZip = hasProp(params, 'zip');
    var hasCity = hasProp(params, 'city') || hasProp(params, 'cityName');
    var hasLat = hasProp(params, 'lat');
    var hasLng = hasProp(params, 'lng');

    if (
        !hasName &&
        !hasAddress &&
        !hasZip &&
        !hasCity &&
        status === undefined &&
        !hasLat &&
        !hasLng
    ) {
        return { updated: false };
    }

    var connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        var rowsResult = await connection.query('SELECT restaurantId FROM restaurants WHERE restaurantId = ? FOR UPDATE', [restaurantId]);
        var rows = Array.isArray(rowsResult) ? rowsResult[0] : rowsResult;
        if (!rows || !rows.length) {
            var notFoundErr = new Error('Restaurant not found');
            notFoundErr.status = 404;
            throw notFoundErr;
        }

        var updates = [];
        var values = [];

        if (hasName) {
            var name = normalizeString(params.name);
            if (!name) {
                var nameErr = new Error('Name is required');
                nameErr.status = 400;
                throw nameErr;
            }
            updates.push('name = ?');
            values.push(name);
        }

        if (hasAddress) {
            var address = normalizeString(params.address);
            updates.push('address = ?');
            values.push(address);
        }

        if (hasZip) {
            var zip = normalizeString(params.zip);
            updates.push('zip = ?');
            values.push(zip);
        }

        if (hasLat) {
            var lat = parseNullableFloat(params.lat, 'latitude');
            if (lat === null) {
                lat = 0;
            }
            updates.push('lat = ?');
            values.push(lat);
        }

        if (hasLng) {
            var lng = parseNullableFloat(params.lng, 'longitude');
            if (lng === null) {
                lng = 0;
            }
            updates.push('lng = ?');
            values.push(lng);
        }

        if (hasCity) {
            var cityInput = hasProp(params, 'city') ? params.city : params.cityName;
            var cityName = normalizeString(cityInput);
            if (!cityName) {
                var cityErr = new Error('City is required');
                cityErr.status = 400;
                throw cityErr;
            }
            var cityId = await getOrCreateCityId(connection, cityName);
            if (!cityId) {
                var cityNotFoundErr = new Error('Unable to determine city');
                cityNotFoundErr.status = 400;
                throw cityNotFoundErr;
            }
            updates.push('cityId = ?');
            values.push(cityId);
        }

        if (status !== undefined) {
            var audit = resolveAuditColumns(status, params?.auth?.user?.userId);
            updates.push('status = ?', 'statusUpdated = ?', 'statusUpdatedBy = ?');
            values.push(audit[0], audit[1], audit[2]);
        }

        if (!updates.length) {
            await connection.rollback();
            return { updated: false };
        }

        values.push(restaurantId);
        var sql = 'UPDATE restaurants SET ' + updates.join(', ') + ' WHERE restaurantId = ?';
        await connection.query(sql, values);

        await connection.commit();
    } catch (err) {
        try {
            await connection.rollback();
        } catch (rollbackErr) {
            // ignore rollback errors
        }
        throw err;
    } finally {
        connection.release();
    }

    return { updated: true };
}

module.exports = {
    getRestaurants: getRestaurants,
    getRestaurant: getRestaurant,
    updateRestaurantLatLngFromGeocode: updateRestaurantLatLngFromGeocode,
    updateRestaurant: updateRestaurant
};
//updateRestaurantLatLngFromGeocode()