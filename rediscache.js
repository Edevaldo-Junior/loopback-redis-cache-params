module.exports = function(Model, options) {
    if(options.client){
        var clientSettings = options.client;
    }else{
        var app = require('../../server/server.js');
        var clientSettings = app.get('redis');
    }

    var redis = require("redis"),
        client = redis.createClient(clientSettings);
    app.clientRedis = client;

    var redisDeletePattern = require('redis-delete-pattern');

    client.on("error", function (err) {
        console.log(err);
        // try to connect again with server config
        if(err.toString().indexOf("invalid password") !== -1){
            console.log("Invalid password... reconnecting with server config...");
            var app = require('../../server/server');
            var clientSettings = app.get('redis');
            client = redis.createClient(clientSettings);
        }
    });


    Model.beforeRemote('**', function(ctx, res, next) {
        // get all find methods and search first in cache
        if((ctx.method.name.indexOf("find") !== -1 || ctx.method.name.indexOf("__get") !== -1) && client.connected){
            if(typeof ctx.req.query.cache != 'undefined'){
                var modelName = ctx.method.sharedClass.name;
                var cachExpire = ctx.req.query.cache;
                // set key name
                const prefix = formatNameData(ctx, res);
                var cache_key = modelName + '_' + prefix + '_' + new Buffer(JSON.stringify(ctx.req.url)).toString('base64');

                // search for cache
                client.get(cache_key, function(err, val) {
                    if(err){
                        console.log(err);
                    }

                    if(val !== null){
                        ctx.result = JSON.parse(val);
                        ctx.done(function(err) {
                            if (err) return next(err);
                        });
                    }else{
                        //return data
                        next();
                    }
                });

            }else{
                next();
            }
        }else{
            next();
        }
    });

    Model.afterRemote('**', function(ctx, res, next) {
        // get all find methods and search first in cache - if not exist save in cache
        if((ctx.method.name.indexOf("find") !== -1 || ctx.method.name.indexOf("__get") !== -1) && client.connected){
            if(typeof ctx.req.query.cache != 'undefined'){
                var modelName = ctx.method.sharedClass.name;
                var cachExpire = ctx.req.query.cache;

                // set key name
                const prefix = formatNameData(ctx, res);
                var cache_key = modelName + '_' + prefix + '_' + new Buffer(JSON.stringify(ctx.req.url)).toString('base64');
                // search for cache
                client.get(cache_key, function(err, val) {
                    if(err){
                        console.log(err);
                    }

                    if(val == null){
                        // set cache key
                        client.set(cache_key, JSON.stringify(res));
                        client.expire(cache_key, cachExpire);
                        next();
                    }else{
                        next();
                    }
                });

            }else{
                next();
            }
        }else{
            next();
        }
    });

    Model.afterRemote('**', function(ctx, res, next) {
        const listCustomEndPoints = [
            'disputedOrder'
        ]
        // delete cache on patchOrCreate, create, delete, update, destroy, upsert
        if((ctx.method.name.indexOf("find") == -1 && ctx.method.name.indexOf("__get") == -1) && client.connected){
            var modelName = ctx.method.sharedClass.name;

            // set key name
            const prefix = formatNameData(ctx, res);
            var cache_key = modelName + '_' + prefix + '_*';
            // delete cache
            redisDeletePattern({
                redis: client,
                pattern: cache_key
            }, function handleError (err) {
                if(err){
                    console.log(err);
                }
                next();
            });

        }else{
            next();
        }
    });

    const formatNameData = (ctx, res) => {
        let prefix = '';
        if (ctx.method.sharedClass.name === 'Order') {
            const result = getOrderId(ctx, res);
            prefix = result;
        } else if (ctx.method.sharedClass.name === 'UserAccount') {
            prefix = getUserId(ctx, res);
        }
        return prefix;
    }

    const getOrderId = (ctx, res) => {
        if (res && res.id && res.id) {
            return res.id.toString();
        } else if (res && res.body && res.body.__data && res.body.__data.id) {
            return res.body.__data.id.toString();
        } else if (res && res.accepted && res.accepted.__data && res.accepted.__data.id) {
            return res.accepted.__data.id.toString();
        } else if (ctx.args && ctx.args.id) {
            return ctx.args.id;
        } else if (ctx.args && ctx.args.order && ctx.args.order.id) {
            return ctx.args.order.id;
        } else if (ctx.args && ctx.args.orderId) {
            return ctx.args.orderId;
        } else if (ctx.args && ctx.args.body && ctx.args.body.idOrder) {
            return ctx.args.body.idOrder;
        } else if (ctx.args && ctx.args.body && ctx.args.body.orderId) {
            return ctx.args.body.orderId;
        } else {
            return ''
        }
    }

    const getUserId = (ctx, res) => {
        if (res && res.id && res.id) {
            return res.id.toString();
        } else if (ctx.args && ctx.args.id) {
            return ctx.args.id;
        } else {
            return ''
        }
    }
}
