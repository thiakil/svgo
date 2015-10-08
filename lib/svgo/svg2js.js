'use strict';

var SAX = require('sax'),
    JSAPI = require('./jsAPI');

var config = {
    strict: true,
    trim: false,
    normalize: true,
    lowercase: true,
    xmlns: true,
    position: true,
};

/**
 * Convert SVG (XML) string to SVG-as-JS object.
 *
 * @param {String} data input data
 * @param {Function} callback
 */
module.exports = function(data, callback) {

    var sax = SAX.parser(config.strict, config),
        root = new JSAPI({ elem: '#document' }),
        current = root,
        stack = [root],
        textContext = null;

    function pushToContent(content) {

        content = new JSAPI(content, current);

        (current.content = current.content || []).push(content);

        return content;

    }

    sax.ondoctype = function(doctype) {

        //sax-js does not parse anything in the doctype.
        //Illustrator files use entities for their namespaces, we need to add them to sax.ENTITIES for it to parse correctly and remove elements with the EditorNS plugin
        //https://xmlwriter.net/xml_guide/entity_declaration.shtml

        var entity_internal = /<!ENTITY\s+([^\s]+)\s+"([^"]+)"\s*>/gm;//<!ENTITY name "entity_value">
        var entity_external = /<!ENTITY\s+([^\s]+)\s+(SYSTEM|PUBLIC)[^>]+>/gm;//<!ENTITY name SYSTEM "URI"> or <!ENTITY name PUBLIC "public_ID" "URI">

        var ent;

        var docNode = pushToContent({
            doctype: doctype
        });

        while (ent = entity_internal.exec(doctype)){
            sax.ENTITIES[ent[1]] = ent[2];
            (docNode.content = docNode.content || []).push(new JSAPI({entity: { raw: ent[0], name: ent[1], value: ent[2]}}, docNode));
        }

        //we wont parse external entities, but lets make them still parse in strict mode!
        //TODO: remove them on parsing and then output them in jstosvg, aside those above
        while (ent = entity_external.exec(doctype)){
            sax.ENTITIES[ent[1]] = '&'+ent[1]+';';
            (docNode.content = docNode.content || []).push(new JSAPI({entity: { raw: ent[0], name: ent[1], value: '&'+ent[1]+';'}}, docNode));
        }

        //remove the parsed entities from the doctype string. TODO: output the properly
        docNode.doctype = docNode.doctype.replace(entity_internal, '').replace(entity_external, '')
            .replace(/(\r?\n[ \t]*\r?\n)*/gm, '')//remove blank lines cause by removing the entity
            .replace(/\[\s*\]/m, '')//remove empty dtd
            .replace(/\[[ \t]+$/m, '[')//remove any extra whitespace on the doctype line we may have left
            .replace(/\s+$/, '');//remove any remaining whitespace we left

    };

    sax.onprocessinginstruction = function(data) {

        pushToContent({
            processinginstruction: data
        });

    };

    sax.oncomment = function(comment) {

        pushToContent({
            comment: comment.trim()
        });

    };

    sax.oncdata = function(cdata) {

        pushToContent({
            cdata: cdata
        });

    };

    sax.onopentag = function(data) {

        var elem = {
            elem: data.name,
            prefix: data.prefix,
            local: data.local
        };

        if (Object.keys(data.attributes).length) {
            elem.attrs = {};

            for (var name in data.attributes) {
                elem.attrs[name] = {
                    name: name,
                    value: data.attributes[name].value,
                    prefix: data.attributes[name].prefix,
                    local: data.attributes[name].local
                };
            }
        }

        elem = pushToContent(elem);
        current = elem;

        // Save info about <text> tag to prevent trimming of meaningful whitespace
        if (data.name == 'text' && !data.prefix) {
            textContext = current;
        }

        stack.push(elem);

    };

    sax.ontext = function(text) {

        if (/\S/.test(text) || textContext) {

            if (!textContext)
                text = text.trim();

            pushToContent({
                text: text
            });

        }

    };

    sax.onclosetag = function() {

        var last = stack.pop();

        // Trim text inside <text> tag.
        if (last == textContext) {
            trim(textContext);
            textContext = null;
        }
        current = stack[stack.length - 1];

    };

    sax.onerror = function(e) {
        throw new Error(e);//throw the error to ourselves to stop it parsing more (it continues on error)
    };

    sax.onend = function() {
        if (!this.error) process.nextTick(function(){callback(root);});
    };

    try {
        sax.write(data);
        if (!sax.error)//shouldnt get here if an error since we throw the error to ourselves
            sax.close();//close calls write, if we dont clear the error it will throw!
    } catch (e) {
        return process.nextTick(function(){callback({ error: e.message });});
    }


    function trim(elem) {
        if (!elem.content) return elem;

        var start = elem.content[0],
            end = elem.content[elem.content.length - 1];

        while (start && start.content && !start.text) start = start.content[0];
        if (start && start.text) start.text = start.text.replace(/^\s+/, '');

        while (end && end.content && !end.text) end = end.content[end.content.length - 1];
        if (end && end.text) end.text = end.text.replace(/\s+$/, '');

        return elem;

    }

};
