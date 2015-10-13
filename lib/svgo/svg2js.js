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

        var docNode = pushToContent({
            doctype: doctype
        });

        //sax-js does not parse anything in the doctype.
        //Illustrator files use entities for their namespaces, we need to add them to sax.ENTITIES for it to parse correctly and remove elements with the EditorNS plugin
        //https://xmlwriter.net/xml_guide/entity_declaration.shtml
        //We will also add it to our JSAPI root (onend), so we can write them out in JS2SVG

        var dtd_check = /\s*\[([\s\S]*)\]\s*/m;

        if (dtd_check.test(doctype) && dtd_check.exec(doctype)[1].trim().length){
        
            var sax_entity = SAX.parser(config.strict, config);
            var dtd_element_name_re = /^(\w+)/;
            var entity_name_re = /^([a-z:_#][a-z:_#0-9-.]+)/;
            var internal_entity_value = /^(['"])(.*)(\1)/;

            sax_entity.onsgmldeclaration = function(sgml){
                //elm = {};
                //console.log("\nsgml: "+sgml);
                if (dtd_element_name_re.test(sgml)){
                    var dtd_element_name = dtd_element_name_re.exec(sgml)[1];
                    switch (dtd_element_name.toLowerCase()){
                        case 'entity': {
                            //console.log("we got an entity!");
                            var entity_element = sgml.replace(dtd_element_name_re, '').trim();

                            if (entity_name_re.test(entity_element)){
                                var entity_name = entity_name_re.exec(entity_element)[1];

                                entity_element = entity_element.replace(dtd_element_name_re, '').trim();

                                if (internal_entity_value.test(entity_element)){
                                    //console.log("internal entity "+entity_name);
                                    var entity_value = internal_entity_value.exec(entity_element)[2];
                                    //console.log(entity_value);
                                    sax.ENTITIES[entity_name] = entity_value;
                                    (docNode.content = docNode.content || []).push(new JSAPI({entity: { name: entity_name, value: entity_value}}, docNode));
                                } else {//probably an external entity, so just prevent sax from bailing
                                    //console.log("external entity "+entity_name);
                                    sax.ENTITIES[entity_name] = '&'+entity_name+';';
                                    (docNode.content = docNode.content || []).push(new JSAPI({'sgml': sgml}, docNode));
                                }
                            } else {
                                //todo: error [entity name]
                            }
                            break;
                        }
                        default:
                            //console.log("We got '"+dtd_element_name+"'");
                            (docNode.content = docNode.content || []).push(new JSAPI({'sgml': sgml}, docNode));
                            break;
                    }
                } else {
                    //todo handle parse error [ not valid sgml element? ]
                }
            }

            var doctypexml = "<d>"+dtd_check.exec(doctype)[1]+"</d>";

            //console.log("giving it "+doctypexml)

            sax_entity.write(doctypexml).close();

            //remove the DTD from the doctype string
            docNode.doctype = docNode.doctype.replace(dtd_check, '');
        }

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
