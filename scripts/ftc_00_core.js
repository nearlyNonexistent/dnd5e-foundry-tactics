const FTC_PACKAGE_NAME = "dnd5e-foundry-tactics";
const FTC_SYSTEM_IDENTIFIER = 'dnd5e_ftc';

/* ------------------------------------------- */
/* FTC GLOBALS AND UTILITY FUNCTIONS            */
/* ------------------------------------------- */
const FTC = {

    ROOT_DIR: 'workshop/'+FTC_PACKAGE_NAME+'/',
    TEMPLATE_DIR: 'workshop/'+FTC_PACKAGE_NAME+'/html/',
    CSS_DIR: 'workshop/'+FTC_PACKAGE_NAME+'/css/',

    /* ------------------------------------------- */

    init: function() {
        hook.call("FTCInit");
        $('body').append('<link rel="stylesheet" href="'+ FTC.CSS_DIR + 'FTC.css" type="text/css" />');
        console.log("D&D5e Foundry Tactics Loaded");
    },

    /* ------------------------------------------- */

    loadTemplate: function(path) {
        /*
        Load a template from the provided path, returning the HTML as a string.
        */
        return $.get({
          url: path,
          dataType: 'html',
          async: false
        }).responseText;
    },

    /* ------------------------------------------- */

    injectTemplate: function(html, target, template) {
        /*
        Inject a sub-template into parent HTML, given a target HTML comment and template path

        Arguments:
            html: An HTML string containing comments with the form <!-- TEMPLATE_NAME -->
            target: The constant name to replace, in this case TEMPLATE_NAME
            template: The path to the HTML template file to
        */
        var target = "<!-- "+target+" -->";
        if (html.includes(target) === false) return html;
        var content = this.loadTemplate(template);
        html = html.replace(target, content)
        return html;
    },

    /* ------------------------------------------- */

    populateTemplate: function(html, data) {
        /*
        Populate an HTML template by embedding data into it from some provided object.

        Arguments:
            html: An HTML string
            data: An arbitrary data object
        */
        return html.replace(/{([\w.]+)}/g, function(match, attr) {
            var val = FTC.getProperty(data, attr);
            return (val !== undefined) ? val : "";
        });
    },

    /* ------------------------------------------- */

    getProperty: function(object, name) {
        /*
        Get object data by name with the format "part1.part2.part3" which would evaluate as obj[part1][part2][part3].
        If any of the requested parts are undefined, this method returns undefined.

        Arguments:
            object: The data object to traverse
            name: The composite property name to search for
        */
        let parts = name.split("."),
            data = object;
        for (let i = 0; i < parts.length; i++) {
            data = data[parts[i]];
            if (data === undefined) {
                break;
            }
        }
        return data;
    },

    /* ------------------------------------------- */

    cleanValue: function(value, dtype) {

        // Strings
        if ( dtype === "str" ) {
            value = value.valid();
        }

        // Tags - comma separated list
        else if ( dtype === "tags" ) {
            let tags = {};
            $.each(value.replace(" ", "").split(','), function(_, tag) {
               tags[tag] = 1;
            });
            value = tags;
        }

        // Integers
        else if ( util.contains(["int", "posint"], dtype) ) {
            value = parseInt((typeof(value) === "number") ? value : value.split(',').join(''));
            if ( dtype === "posint" )  value = Math.max(value, 0);
        }

        // Floats
        else if ( util.contains(["float", "posfloat"], dtype) ) {
            value = parseFloat((typeof(value) === "number") ? value : value.split(',').join(''));
            if ( dtype === "posfloat" ) value = Math.max(value, 0);
        }

        // Return cleaned value
        return value;
    },

    /* ------------------------------------------- */

    getTargetKey: function(data, name) {
        let parts = name.split("."),
              key = parts.pop() || "",
             part = undefined;
        for (let i = 0; i < parts.length; i++) {
            part = parts[i];
            if ( !data[part] ) return [{}, key];
            data = data[part];
        }
        return [data, key];
    },

    /* ------------------------------------------- */

    setProperty: function(data, name, value, dtype) {

        // TODO: Temporary dtype assignment
        if ( name === "tags" ) dtype = dtype || "tags";
        if ( name.startsWith("stats.") ) dtype = dtype || "posint";
        if ( name.startsWith("counter") ) dtype = dtype || "posint";

        // Sanitize target value
        value = FTC.cleanValue(value, dtype);

        // Get the data target
        let [target, key] = FTC.getTargetKey(data, name);
        if ( !target || !key ) return;

        // Set the value if it is defined
        if (value !== undefined && value !== "") target[key] = value;
        else delete target[key];
    },

    /* ------------------------------------------- */

    saveObject: function(object) {
        delete object.data.ftc;
        object.sync("updateAsset");
    }

};


// An Prototypical Pattern for Rendering Rich Object Templates
class FTCObject {

    get data() {
        return this.obj.data;
    }

    get info() {
        return this.data.info;
    }

    get name() {
        return this.info.name.current;
    }

    /* ------------------------------------------- */

    constructor(obj, app, scope) {
        // Core Object constructor
        this.app = app;
        this.changed = false;
        this.scope = this.refineScope(scope || {});
        this.obj = this.createObject(obj);
    }

    /* ------------------------------------------- */

    refineScope(scope) {
        // Process or validate any scope-specific inputs provided to the object
        return scope;
    }

    /* ------------------------------------------- */

    createObject(obj) {
        // Ensure that the object contains a sync.obj in case only data was provided
        if ( "sync" in obj ) {
            return obj;
        } else {
            let newObj = sync.obj();
            newObj.data = obj;
            return newObj;
        }
    }

    /* ------------------------------------------- */

    getData(name) {
        FTC.getProperty(this.data, name);
    }

    /* ------------------------------------------- */

    setData(name, value, dtype) {
        FTC.setProperty(this.data, name, value, dtype);
        this.changed = true;
    }

    /* ------------------------------------------- */

    save() {
        // Sync the object, saving updated data and refreshing associated UI elements.
        if ( !this.changed ) return;
        console.log("Saving object " + this.name);
        this.obj.sync("updateAsset");
    }

    /* ------------------------------------------- */

    renderHTML() {

        // Construct enriched safe data
        let data = duplicate(this.data);
        data = this.enrichData(data);

        // Build Template and Populate Data
        let html = this.buildHTML(data);
        html = $(this.populateHTML(html, data));

        // Activate Event Listeners
        this.activateEventListeners(html);

        // Return the final HTML
        return html;
    }

   /* ------------------------------------------- */

    enrichData(data) {
        // Enrich a safe copy of object data for rendering by augmenting it with additional metadata and attributes
        return data;
    }

    /* ------------------------------------------- */

    buildHTML() {
        console.log("A FTCObject subclass must implement the buildHTML method.");
    }

    /* ------------------------------------------- */

    populateHTML(html, data) {
        return FTC.populateTemplate(html, data);
    }

    /* ------------------------------------------- */

    activateEventListeners(html) {
    }
}


/* -------------------------------------------- */
/* GM Forge Initialization Hook                 */
/* -------------------------------------------- */

hook.add("Initialize", "FTCSetup", function(...args) {
    let gameid = game.templates.identifier;

    // Only initialize FTC if we are using the correct system OR no system at all
    if ( gameid === FTC_SYSTEM_IDENTIFIER ) FTC.init();
    else console.log("Foundry Tactics is enabled but not active for system: " + gameid);
});
