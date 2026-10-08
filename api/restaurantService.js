var db = require('../connections');
var axios = require('axios');
var config = require('../config');
var locationHelper = require('./locationHelper');
var paginationHelper = require('./paginationHelper');

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

var VALID_STATUSES = new Set(['approved', 'rejected', 'pending', 'needs_review', 'out_of_area']);

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

    var result = await connection.query('SELECT cityId FROM cities WHERE city = ? LIMIT 1', [name]);
    var rows = result[0];
    if (rows.length) {
        return rows[0].cityId;
    }

    var insertResult = await connection.query("INSERT INTO cities (city, state, lat, lng) VALUES (?, '', 0, 0)", [name]);
    var header = insertResult[0];
    return header.insertId;
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
    if (status === 'pending' || status === 'out_of_area') {
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
            selectExtra = ', ST_Distance_Sphere(coords, ' + locationHelper.pointFromWktSql() + ') as distance';
            selectExtraValues.push(locationHelper.buildPointWkt(lat, lng));
        }
    }

    var fromClause = ' FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId';
    var whereClauses = ['1=1'];
    var whereValues = [];

    var isAdmin = String(params?.auth?.user?.isAdmin) === '1';
    var statusFilter = params.status ? String(params.status).toLowerCase() : '';
    var forSubmission = String(params.forSubmission) === '1' && Boolean(params.auth && params.auth.user);

    if (forSubmission) {
        selectClause = 'r.restaurantId, r.name, r.address, r.zip, r.status, c.city as cityName';
        whereClauses.push("r.status IN ('approved', 'pending', 'needs_review')");
    } else if (statusFilter === 'pending') {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("r.status = 'pending'");
    } else if (statusFilter === 'needs_review') {
        if (!isAdmin) {
            var err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }
        whereClauses.push("r.status = 'needs_review'");
    } else if (statusFilter === 'out_of_area') {
        if (!isAdmin) {
            var outOfAreaErr = new Error('Forbidden');
            outOfAreaErr.status = 403;
            throw outOfAreaErr;
        }
        whereClauses.push("r.status = 'out_of_area'");
    } else if (statusFilter === 'rejected' && !isAdmin) {
        var rejectedErr = new Error('Forbidden');
        rejectedErr.status = 403;
        throw rejectedErr;
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
        whereValues.push('%' + String(params.prefix).replace(/[\\%_]/g, '\\$&') + '%');
    }

    var whereSql = ' WHERE ' + whereClauses.join(' AND ');

    var countSql = 'SELECT COUNT(*) AS total' + fromClause + whereSql;
    var countRows = await db.query(countSql, whereValues);
    var total = countRows.length ? countRows[0].total : 0;

    var paginationParams = Object.assign({}, params);
    if (paginationParams.pageSize === undefined && params.take !== undefined) {
        paginationParams.pageSize = params.take;
    }
    var pagination = paginationHelper.normalizePagination(paginationParams, 10);
    var take = pagination.pageSize;
    var skip = pagination.offset;

    if (params.skip) {
        var parsedSkip = parseInt(params.skip, 10);
        if (!isNaN(parsedSkip) && parsedSkip >= 0) {
            skip = parsedSkip;
        }
    }

    var orderClause = ' ORDER BY r.name ASC, r.restaurantId ASC';
    if (useLocation && lat && lng) {
        orderClause = ' ORDER BY distance ASC, r.name ASC, r.restaurantId ASC';
    }

    var dataSql = 'SELECT ' + selectClause + selectExtra + fromClause + whereSql + orderClause + ' LIMIT ? OFFSET ?';
    var dataValues = [].concat(selectExtraValues, whereValues, [take, skip]);

    var rows = await db.query(dataSql, dataValues);

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
    var submitterSelect = isAdmin ? ', u.firstName as submitterFirstName, u.lastName as submitterLastName, u.email as submitterEmail' : '';
    var submitterJoin = isAdmin ? ' LEFT JOIN users u ON r.submittedBy = u.userId' : '';
    var sql = 'SELECT r.*, c.city as cityName' + submitterSelect + ' FROM restaurants r LEFT JOIN cities c ON r.cityId = c.cityId' + submitterJoin + ' WHERE r.restaurantId = ?';
    var vals = [params.restaurantId];

    if (!isAdmin) {
        sql += " AND r.status = 'approved'";
    }

    var rows = await db.query(sql, vals);
    return rows[0] || null;
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
        var rows = rowsResult[0];
        if (!rows.length) {
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

async function getRestaurantStats(restaurantId) {
    var threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    var [stats] = await db.query(
        "SELECT COUNT(*) AS dishCount, AVG(score) AS avgScore, " +
        "COALESCE(SUM(reviewCount), 0) AS totalReviews " +
        "FROM dishes WHERE restaurantId = ? AND status = 'approved'",
        [restaurantId]
    );
    var [recent] = await db.query(
        "SELECT COUNT(*) AS recentReviews FROM reviews rv " +
        "JOIN dishes d ON d.dishId = rv.dishId " +
        "WHERE d.restaurantId = ? AND d.status = 'approved' " +
        "AND rv.status = 'approved' AND rv.submitted >= ?",
        [restaurantId, threeMonthsAgo]
    );
    return {
        dishCount: stats.dishCount,
        avgScore: stats.avgScore === null ? null : Math.round(stats.avgScore * 10) / 10,
        totalReviews: stats.totalReviews,
        recentReviews: recent.recentReviews
    };
}

module.exports = {
    getRestaurants: getRestaurants,
    getRestaurant: getRestaurant,
    getRestaurantStats: getRestaurantStats,
    updateRestaurantLatLngFromGeocode: updateRestaurantLatLngFromGeocode,
    updateRestaurant: updateRestaurant
};
//updateRestaurantLatLngFromGeocode()
