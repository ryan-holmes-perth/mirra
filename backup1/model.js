import { DateTime, Duration } from 'luxon';

class MirraBehaviour {
    undo = {
        client: {
            enabled: false,
            maxLevels: 10,
            maxDuration: new Duration({ hours: 2 }),
            onsave: 'clear'   // or 'keep' or 'flatten' ?
        },
        server: {
            enabled: false,
            maxLevels: 10,
            maxDuration: new Duration({ hours: 2 })
        }
    };

    sync = {
        delay: new Duration({ seconds: 5 }),
        between: new Duration({ seconds: 15 })
    };

    rel = {
        parent: {
            type: "",
            property: ""
        },
        children: [
            {
                type: "",
                property: ""
            }
        ],
        related: [
            {
                type: "",
                property: ""
            }
        ]
    };
}



class MirraModel {

    #key = null;
    #_data = {};
    #data = {};

    #changes = [];      // for undoing
    /* e.g.:

        changes = [
            { order: 17, current: false, data: { name='Susan Lasso' }  },
            { order: 18, current: true, data: { name='Susan Laso' }  },
            { order: 21, current: false, data: { age=55 }  },
            { order: 23, current: false, data: { age=54 }  }
        ];

    */

    constructor(key, data) {
        data = data || {};

        if (key) {
            this.#key = key;

            if (data == {}) {
                // if no data provided, load it from the db
                this.load();
            } else {
                // otherwise assume it was just preloaded from the db and just set it
                Object.assign(this.#_data, data);
                Object.assign(this.#data, data);
            }
        } else {
            // for creating a brand new object yet to be persisted
            Object.assign(this.#_data, data);
        }
    }

    get type() {
        throw new Error('Subclasses must implement the "type" getter');
    }

    get properties() {
        throw new Error('Subclasses must implement the "properties" getter');
    }

    #prepare() { }
    #show() { }
    #hide() { }
    #destroy() { }

    #create() { }
    #read() { }
    #update(data) { }
    #delete() {
        // maybe mark a deleted flag rather than remove, so can be recovered / undone ?
    }

    // get the client version of the data
    get() {
        return {
            ...this.key,
            ...this._data
        };
    }

    // set the client version of the data
    set(data) {
        // chaining method to enable a .save() on the back of it
        this._data = data;
        return this;
    }

    // load data from server and sync with client object
    load() {
        this._read();
        // check for conflicts here? or just server?
        Object.assign(this._data, this.data);
    }

    // save data to server 
    save() {
        this._read();
        // check for conflicts here? or just server?
        // copies properties from _data to data and persist it - chaining to enable a load() on the back of it (or maybe that's automatic?)
        // Object.assign(this.data, this._data);
        this._update(this._data);
        // this.load(); - let the socket message update it

    }

    // revert client data back to the saved server data
    revert() {
        Object.assign(this._data, this.data);
    }

    undo() {
        // no parameters: undo last change
        // int parameter: undo last n changes
        // datetime parameter: undo until then
    }

    delete() {
        this._delete();
        // mark the view(s) as deleted - which may mean invisible, or greyed out, or ...etc...
    }

    view(type) {
        // if type is not provided, return the default view
    }


    // _ prefix for transients?
    // specification of property types and/or validation?
}