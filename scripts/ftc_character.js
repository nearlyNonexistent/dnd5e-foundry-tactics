
/* ------------------------------------------- */
/* Character Object Type                       */
/* ------------------------------------------- */

class FTCCharacter extends FTCEntity {

    constructor(obj, app, scope) {
        super(obj, app, scope);

        // Primary Templates
        this.templates = {
            FTC_SHEET_FULL: FTC.TEMPLATE_DIR + 'charsheet.html',
            FTC_SHEET_PRIVATE: FTC.TEMPLATE_DIR + 'privatesheet.html',
            FTC_SKILL_HTML: FTC.TEMPLATE_DIR + 'skill.html',
            FTC_ATTRIBUTE_HTML: FTC.TEMPLATE_DIR + 'characters/attribute.html',
            INVENTORY_HEADER: FTC.TEMPLATE_DIR + 'characters/items/inventory-header.html',
            INVENTORY_ITEM: FTC.TEMPLATE_DIR + 'characters/items/inventory-item.html',
            FTC_SPELL_LEVEL: FTC.TEMPLATE_DIR + 'spellheader.html',
            FTC_SPELL_HTML: FTC.TEMPLATE_DIR + 'spell.html',
            CHARACTER_TAB_TRAITS: FTC.TEMPLATE_DIR + 'characters/tab-traits.html',
            CHARACTER_PRIMARY_STATS: FTC.TEMPLATE_DIR + 'characters/primary-stats.html',
            CHARACTER_ABILITY: FTC.TEMPLATE_DIR + 'characters/character-ability.html'
        };

        // Register local for debugging
        FTC.character = this;
    }

    /* ------------------------------------------- */

    get dice() {
        this._dice = this._dice || new FTCDice(this);
        return this._dice;
    }

    /* ------------------------------------------- */
    /* HTML Rendering                              */
    /* ------------------------------------------- */

    refineScope(scope) {
        scope.isPrivate = (scope.viewOnly && (!this.obj || !this.obj.id()));
        return scope;
    }

    /* ------------------------------------------- */

    enrichData(data, scope) {

        // Temporary FTC display data
        const ftc = {};
        data.ftc = ftc;

        // Level and Experience
        data.counters.level.current = Math.min(Math.max(data.counters.level.current, 1), 20);
        let lvl = data.counters.level.current,
            start = FTC.actions.get_next_level_exp(lvl - 1),
            cur = Math.max(data.counters.exp.current, start),
            next = FTC.actions.get_next_level_exp(lvl),
            pct = ((cur - start) * 100) / (next - start);
        ftc['exp'] = {
            "lvl": lvl,
            "current": cur.toLocaleString(),
            "next": next.toLocaleString(),
            "pct": Math.min(pct, 99.5),
            "cls": (pct >= 100) ? "leveled": ""
        };

        // Proficiency Bonus
        let prof = Math.floor((lvl + 7) / 4);
        data.counters.proficiency.current = prof;

        // Enrich Attributes
        $.each(data.stats, function(attr, stat) {
            ftc[attr] = {
                'mod': stat.modifiers.mod,
                'svmod': (stat.proficient * data.counters.proficiency.current) + stat.modifiers.mod,
                'padstr': FTC.ui.padNumber(stat.current, 2),
                'modstr': (stat.modifiers.mod < 0 ? "" : "+" ) + stat.modifiers.mod
            }
        });

        // Initiative Bonus
        let initMod = parseInt(data.stats["Dex"].modifiers.mod) + parseInt(data.counters.initiative.current);
        ftc["initiative"] = (initMod < 0 ? initMod : "+"+initMod) + "." + ftc["Dex"].padstr;

        // Spellcasting DC
        let spellAttr = data.info.spellcasting.current,
            mod = spellAttr ? data.ftc[spellAttr].mod : undefined;
        ftc["spellMod"] = mod;
        ftc["spellDC"] = mod ? 8 + mod + data.counters.proficiency.current : undefined;
        ftc["spellDCstr"] = mod ? "Spell DC " + data.ftc["spellDC"] : "";

        // Enrich Skills
        $.each(data.skills, function(name, skill) {
            let stat = data.ftc[skill.stat],
                 mod = ((skill.current || 0) * data.counters.proficiency.current) + stat.mod;
            ftc[name] = {
                'mod': mod,
                'modstr': (mod < 0 ? "" : "+" ) + mod
            }
        });

        // Base Armor Class
        data.ftc["baseAC"] = 10 + data.ftc["Dex"].mod;

        // Set up owned items
        this.setupInventory(data);
        this.setupSpellbook(data);
        this.setupAbilities(data);

        // Return the enriched data
        return data
    }

    /* ------------------------------------------- */

    setupInventory(data) {
        // Set up inventory items by converting them to FTCItem objects

        const ftc = data.ftc,
            owner = this.owner,
            weight = [],
            inventory = {
            "weapons": {
                "name": "Weapons",
                "items": [],
                "type": "weapon"
            },
            "equipment": {
                "name": "Equipment",
                "items": [],
                "type": "armor"
            },
            "tools": {
                "name": "Tools",
                "items": [],
                "type": "item",
            },
            "consumables": {
                "name": "Consumables",
                "items": [],
                "type": "item"
            },
            "pack": {
                "name": "Backpack",
                "items": [],
                "type": "item"
            }
        };

        // Iterate over inventory items
        $.each(data.inventory, function(itemId, itemData) {
            let item = new FTCItem(itemData, {"owner": owner, "container": "inventory"});

            // Set id and class
            item.data.itemId = itemId;
            item.data.itemCls = ( item.type === "weapon" && item.weapon.damage.current ) ?
                "ftc-rollable" : "";

            // Push into type
            if ( item.type === "weapon" ) {
                inventory.weapons.items.push(item);
            } else if ( item.type === "armor" && item.armor.equipped.current === 1 ) {
                inventory.equipment.items.push(item);
            } else if ( item.type === "item" && item.info.variety.current === "tool" ) {
                inventory.tools.items.push(item);
            } else if ( item.type === "item" && item.info.variety.current === "consumable" ) {
                inventory.consumables.items.push(item);
            } else {
                inventory.pack.items.push(item);
            }

            // Record total entry weight
            weight.push(parseFloat(item.info.weight.current) * parseFloat(item.info.quantity.current));
        });
        ftc.inventory = inventory;


        // Compute weight and encumbrance
        let wt = (weight.length > 0) ? weight.reduce(function(total, num) { return total + (num || 0); }) : 0,
           enc = data.stats.Str.current * 15,
           pct = Math.min(wt * 100 / enc, 99.5),
           cls = (pct > 90 ) ? "heavy" : "";
        ftc["weight"] = {"wt": wt, "enc": enc, "pct": pct, "cls": cls};
    }

    /* ------------------------------------------- */

    setupSpellbook(data) {
        // Set up spellbook items by converting them to FTCItem objects

        const ftc = data.ftc,
            sls = {};

        // Iterate over spellbook spells
        $.each(data.spellbook, function(spellId, itemData) {

            // Construct the item object
            let item = new FTCItem(itemData, {"owner": this.owner, "container": "spellbook"}),
                spell = item.spell;

            // Construct spell data
            let lvl = (spell.level.current === "Cantrip") ? 0 : parseInt(spell.level.current || 0);
            item.spellid = spellId;

            // Record spell-level
            sls[lvl] = sls[lvl] || {
                "level": lvl,
                "name": (lvl === 0) ? "Cantrip" : FTC.ui.getOrdinalNumber(lvl) + " Level",
                "current": FTC.getProperty(data, 'counters.spell'+lvl+'.current') || 0,
                "max": FTC.getProperty(data, 'counters.spell'+lvl+'.max') || 0,
                "spells": [],
            };
            sls[lvl].current = (lvl === 0) ? "&infin;" : sls[lvl].current;
            sls[lvl].max = (lvl === 0) ? "&infin;" : sls[lvl].max;
            sls[lvl].spells.push(item);
        });
        ftc['spellbook'] = sls;
    }

    /* ------------------------------------------- */

    setupAbilities(data) {
        // Set up ability items by converting them to FTCItem objects

        const ftc = data.ftc;
        ftc["abilities"] = [];
        $.each(data.abilities, function(itemId, itemData) {
            let item = new FTCItem(itemData, {"owner": this.owner, "container": "abilities"});
            ftc.abilities.push(item);
        });
    }

    /* ------------------------------------------- */

    buildHTML(data, scope) {

        // Load primary template
        let template = scope.isPrivate ? this.templates.FTC_SHEET_PRIVATE : this.templates.FTC_SHEET_FULL,
            main = FTC.loadTemplate(template);

        // Augment sub-components
        if (!scope.isPrivate) {

            // Primary Stats
            main = FTC.injectTemplate(main, "CHARACTER_PRIMARY_STATS", this.templates.CHARACTER_PRIMARY_STATS)

            // Attributes
            let attrs = "";
            let template = FTC.loadTemplate(this.templates.FTC_ATTRIBUTE_HTML);
            for ( var s in data.stats ) {
                attrs += template.replace(/\{stat\}/g, s);
            }
            main = main.replace("<!-- FTC_ATTRIBUTE_HTML -->", attrs);

            // Insert Skills
            let skills = "";
            template = FTC.loadTemplate(this.templates.FTC_SKILL_HTML)
            for (var s in data.skills) {
                skills += template.replace(/\{skl\}/g, s);
            }
            main = main.replace("<!-- FTC_SKILL_HTML -->", skills);

            // Insert Inventory
            let inventory = "",
                itemHeader = FTC.loadTemplate(this.templates.INVENTORY_HEADER),
                itemTemplate = FTC.loadTemplate(this.templates.INVENTORY_ITEM);
            $.each(data.ftc.inventory, function(_, type) {
                inventory += FTC.populateTemplate(itemHeader, type);
                $.each(type.items, function(_, item) {
                    inventory += FTC.populateTemplate(itemTemplate, item.data);
                });
            });
            inventory = inventory || '<li><blockquote class="compendium">Add items from the compendium.</blockquote></li>';
            main = main.replace("<!-- FTC_INVENTORY_HTML -->", inventory);

            // Insert Spells
            let spells = "",
                ltmp = FTC.loadTemplate(this.templates.FTC_SPELL_LEVEL),
                stmp = FTC.loadTemplate(this.templates.FTC_SPELL_HTML);
            $.each(data.ftc.spellbook, function(l, s){
                spells += FTC.populateTemplate(ltmp, s);
                $.each(s.spells, function(i, p){
                    spells += FTC.populateTemplate(stmp, p);
                });
            });
            spells = spells || '<li><blockquote class="compendium">Add spells from the compendium.</blockquote></li>';
            main = main.replace("<!-- FTC_SPELLS_HTML -->", spells);

            // Abilities
            let abilities = "";
            template = FTC.loadTemplate(this.templates.CHARACTER_ABILITY);
            $.each(data.ftc.abilities, function(i, item) {
                item.itemid = i;
                abilities += FTC.populateTemplate(template, item);
            });
            abilities = abilities || '<li><blockquote class="compendium">Add abilities from the compendium.</blockquote></li>';
            main = main.replace("<!-- CHARACTER_TAB_ABILITIES -->", abilities);

            // Character Traits
            main = FTC.injectTemplate(main, "CHARACTER_TAB_TRAITS", this.templates.CHARACTER_TAB_TRAITS)
        }
        return main;
    }

    /* ------------------------------------------- */

    activateListeners(html, app, scope) {
        FTC.ui.activate_tabs(html, this.obj, app);
        FTC.forms.activateFields(html, this, app);
        FTC.actions.activateActions(html, this, app);
    }

    /* ------------------------------------------- */
    /* Owned Items                                 */
    /* ------------------------------------------- */

    addItem(item, container) {
        const type = item.type;
        if ( !container ) {
            if (["weapon", "armor", "item"].includes(type)) container = "inventory";
            else if ("spell" === type) container = "spellbook";
            else if ("ability" === type) container = "abilities";
        }
        if ( !container ) return;

        // If we are dropping a spell on the inventory tab, it's a "Scroll of ___"
        if ( type === "spell" && FTC.character.data.tabs["content-tabs"] === "tab-inventory" ) {
            item.data.info.name.current = "Scroll of " + item.data.info.name.current;
            item.data.info.type.current = item.types.ITEM_TYPE_DEFAULT;
            item.data.info.variety.current = "consumable";
            container = "inventory";
        }

        // Push the item in
        this.data[container].push(item.data);
        this._changed = true;
        this.save();
    }

    /* ------------------------------------------- */

    updateItem(container, itemId, itemData) {
        this.data[container][itemId] = itemData;
        this._changed = true;
        this.save();
    }

    /* ------------------------------------------- */

    deleteItem(container, itemId) {
        this.data[container].splice(itemId, 1);
        this._changed = true;
        this.save();
    }
}


/* -------------------------------------------- */
/* Character Sheet Sync Render                  */
/* -------------------------------------------- */

sync.render("FTC_CHARSHEET", function (obj, app, scope) {
    if ( game.templates.identifier !== FTC_SYSTEM_IDENTIFIER ) {
        return $("<div>Sorry, no preview available at the moment.</div>");
    }
    const char = new FTCCharacter(obj);
    return char.renderHTML(app, scope);
});

