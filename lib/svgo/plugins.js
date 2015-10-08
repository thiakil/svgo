'use strict';

var async = require('async');

/**
 * Plugins engine.
 *
 * @module plugins
 *
 * @param {Object} data input data
 * @param {Object} plugins plugins object from config
 * @return {Object} output data
 */
module.exports = function(data, plugins, callback) {

    async.eachSeries(plugins, function(group, next_group) {

        function group_callback(return_data){
            process.nextTick(next_group);
        }

        switch(group[0].type) {
            case 'perItem':
                perItem(data, group, false, group_callback);
                break;
            case 'perItemReverse':
                perItem(data, group, true, group_callback);
                break;
            case 'full':
                full(data, group, group_callback);
                break;
        }

    }, function(err){
        process.nextTick(function(){callback(data)});
    });

};

function filter_this_item(item, plugins, filter_item_callback){

    async.eachSeries(plugins, function(plugin, next_plugin){
        if (plugin.active && plugin.fn(item, plugin.params) === false) {
            process.nextTick(function(){next_plugin(plugin)});//this should halt the run, use this plugin's object as err (though we can use whatever here)
        } else {
            process.nextTick(next_plugin);
        }
    }, function(err){
        if (err === undefined || err === null){
            process.nextTick(function(){filter_item_callback(true)});
        } else {
            process.nextTick(function(){filter_item_callback(false)});
        }
    })
}

/**
 * Direct or reverse per-item loop.
 *
 * @param {Object} data input data
 * @param {Array} plugins plugins list to process
 * @param {Boolean} [reverse] reverse pass?
 * @return {Object} output data
 */
function perItem(data, plugins, reverse, callback) {

    async.filter(data.content, function(filter_item, filter_callback) {

        if (reverse) {
            if (filter_item.content && filter_item.elem != 'foreignObject'){
                perItem(filter_item, plugins, reverse, function(sub_items){
                    filter_this_item(filter_item, plugins, filter_callback);
                })
            } else {
                filter_this_item(filter_item, plugins, filter_callback);
            }
        } else {
            filter_this_item(filter_item, plugins, function(filt_res){
                if (!filt_res) {
                    //this item is being filtered, just return that to this element's filter result
                    return process.nextTick(function(){filter_callback(filt_res)});
                }
                if (filter_item.content && filter_item.elem != 'foreignObject'){
                    perItem(filter_item, plugins, reverse, function(){
                        process.nextTick(function(){filter_callback(filt_res)});
                    });
                } else {
                    process.nextTick(function(){filter_callback(filt_res)});
                }
            });
        }

    }, function(items){
        data.content = items;
        return process.nextTick(function(){callback(data)});
    });

}

/**
 * "Full" plugins.
 *
 * @param {Object} data input data
 * @param {Array} plugins plugins list to process
 * @return {Object} output data
 */
function full(data, plugins, callback) {

    plugins.forEach(function(plugin) {
        if (plugin.active) {
            plugin.fn(data, plugin.params);
        }
    });

    return process.nextTick(function(){callback(data)});

}
