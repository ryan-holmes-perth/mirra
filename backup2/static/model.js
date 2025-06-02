import { DateTime, Duration } from 'https://esm.sh/luxon';
import $ from 'https://esm.sh/jquery';
import mitt from 'https://esm.sh/mitt';




import mitt from "https://esm.sh/mitt";

function emitter() {
    const base = mitt();
    const wildcardHandlers = [];

    const patternToRegex = (pattern) =>
        new RegExp(
            '^' +
            pattern
                .split('*')
                .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('.*') +
            '$'
        );

    return {
        on(type, handler) {
            if (type.includes('*')) {
                const regex = patternToRegex(type);
                wildcardHandlers.push({ pattern: type, regex, handler });
            } else {
                base.on(type, handler);
            }
        },
        off(type, handler) {
            if (type.includes('*')) {
                for (let i = wildcardHandlers.length - 1; i >= 0; i--) {
                    const h = wildcardHandlers[i];
                    if (h.pattern === type && h.handler === handler) {
                        wildcardHandlers.splice(i, 1);
                    }
                }
            } else {
                base.off(type, handler);
            }
        },
        emit(type, event) {
            base.emit(type, event);
            for (const { regex, handler } of wildcardHandlers) {
                if (regex.test(type)) {
                    handler(event, type);
                }
            }
        },
    };
}
export const bus = emitter();


export function err(message) {
    // console.error(message);
    throw new Error(message);
}

async function f(method, url, body) {
    const result = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
    });
    if (check(result)) {
        const data = await result.json();
        return data;
    }
}

function check(result) {
    if (result.ok) {
        return true;
    } else {
        err(result.statusText);
    }
}


// class MirraQueue {
//   constructor() {
//     this.queue = Promise.resolve(); // Start with a resolved promise
//   }

//   q(taskFn) {
//     // Chain the task onto the current queue
//     this.queue = this.queue.then(() => taskFn()).catch(err => {
//       console.error('Task failed:', err);
//     });
//     return this.queue;
//   }
// }


export function browserId() {
    const key = 'anonymousUserId';
    let id = localStorage.getItem(key);
    if (!id) {
        id = crypto.randomUUID(); // Supported in modern browsers
        localStorage.setItem(key, id);
    }
    return id;
}

window.browserId = browserId;


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



export class MirraModel {

    #key = null;
    #_data = {};
    #data = {};
    #views = [];

    #persisted = false;

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

        console.log("@", key, data);

        if (this.#persisted) {
            this.#key = key;

            console.log(data);
            if (Object.keys(data).length == 0) {
                // if no data provided, load it from the db
                console.log("%");
                this.load().then(this.#refresh);
            } else {
                // otherwise assume it was just preloaded from the db and just set it
                Object.assign(this.#_data, data);
                Object.assign(this.#data, data);
            }
        } else {
            // for creating a brand new object yet to be persisted
            data._id = crypto.randomUUID(); // Generate a new ID for the object
            this.set(data);
        }
    }

    get type() {
        throw new Error('Subclasses must implement the "type" getter');
    }

    get properties() {
        throw new Error('Subclasses must implement the "properties" getter');
    }

    // get views() {
    //     throw new Error('Subclasses must implement the "ui" getter');
    // }

    register(view) {
        this.#views.push(view);
    }

    async #refresh() {
        for (let view of this.#views) {
            view.update();
        }
    }

    get watchers() {
        return {}
    }

    #setupWatchers() {
        for (const expression in this.watchers) {
            const pattern = eval('`' + expression + '`');
            bus.on(pattern, (event, data) => {
                this.#refresh();
                if (data.callback) {
                    data.callback(this);
                }
            });
        }
    }

    async #create(data) {
        // console.log({
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify(data)
        // });

        const result = await fetch("/" + this.type, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        if (check(result)) {
            const data = await result.json();
            console.log("###", data)
            this.#key = data.id;
        }
    }
    async #read() {
        console.log(1, `/${this.type}/${this.#key}`);
        const result = await fetch(`/${this.type}/${this.#key}`);
        console.log(2, result);
        let data = await user.json();
        console.log(3, data);
        Object.assign(this.#data, data);
    }
    async #update(data) {
        console.log(1, `/${this.type}/${this.#key}`);
        await fetch(`/${this.type}/${this.#key}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...data,
                id: this.#key,
            })
        });
    }
    async #delete() {
        // maybe mark a deleted flag rather than remove, so can be recovered / undone ?
        await fetch(`/${this.type}/${this.#key}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: this.#key,
            })
        });


    }

    // get the client version of the data
    get() {
        return {
            ...this.#key,
            ...this.#_data
        };
    }

    // set the client version of the data
    set(data) {
        // chaining method to enable a .save() on the back of it
        this.#_data = {
            ...data,
            _t: Date.now(),
            _u: browserId(),
            _x: false
        };
        this.#refresh();
        return this;
    }

    // load data from server and sync with client object
    async load() {
        // let t = this.#_t, u = this.#_u;
        await this.#read();

        // if (t && u && (t != this.#_t || u != this.#_u)) {
        //     // handle conflicts
        //     if (confirm('remote object was updated - overwrite your changes?')) {
        //         Object.assign(this.#_data, this.#data);
        //     }
        // } else {
        Object.assign(this.#_data, this.#data);
        // }

        this.#refresh();
    }

    // save data to server 
    async save() {
        // let t = this.#_t, u = this.#_u;
        // await this.#read();
        // // check for conflicts here? or just server?
        // // copies properties from _data to data and persist it - chaining to enable a load() on the back of it (or maybe that's automatic?)
        // // Object.assign(this.data, this._data);
        // if (t && u && (t != this.#_t || u != this.#_u)) {
        //     // handle conflicts
        //     if (confirm('remote object was updated - overwrite your changes?')) {
        //         this.#update(this.#_data);
        //     }
        // } else {
        if (this.#persisted) {
            await this.#update(this.#_data);
        } else {
            await this.#create(this.#_data);
        }
        // }


        // this.load(); - let the socket message update it

    }

    // revert client data back to the saved server data
    async revert() {
        Object.assign(this.#_data, this.#data);
        this.#refresh();
    }

    async undo() {
        // no parameters: undo last change
        // int parameter: undo last n changes
        // datetime parameter: undo until then
    }

    async delete() {
        await this.#delete();
        // mark the view(s) as deleted - which may mean invisible, or greyed out, or ...etc...
        this.#refresh();
    }

    // view(type, appendTo = null) {
    //     type = type || 'view';
    //     if (!this.#views[type]) {
    //         this.#ui(type);
    //     }
    //     if (appendTo) {
    //         this.#views[type].appendTo(appendTo);
    //     }
    //     return this.#views[type];
    // }


    // _ prefix for transients?
    // specification of property types and/or validation?
}


class Model extends MirraModel {
}


export class Person extends Model {
    get type() {
        return 'persons';
    }
    get properties() {
        return {
            name: { type: String, length: { min: 2, max: 30 } }
        };
    }
}

window.Person = Person;



export class MirraGroup {
    #views = [];
    #childViews = [];

    constructor(childViews = null) {
        this.#childViews = childViews;
        this.#setupWatchers();
    }

    get type() {
        throw new Error('Subclasses must implement the "type" getter');
    }

    get childViews() {
        return this.#childViews;
    }

    register(view) {
        this.#views.push(view);
    }

    async #refresh() {
        for (let view of this.#views) {
            view.update();
        }
    }

    get watchers() {
        return {}
    }

    #setupWatchers() {
        for (const expression in this.watchers) {
            const pattern = eval('`' + expression + '`');
            bus.on(pattern, (event, data) => {
                this.#refresh();
                if (data.callback) {
                    data.callback(this);
                }
            });
        }
    }

}



export class MirraView {
    #models;
    #ui;

    constructor(models = {}) {
        // validate
        const expected = this.models();
        if (expected) {
            for (const m in models) {
                if (!(m in expected)) {
                    err(`Model ${m} not expected in view - expected ${Object.keys(expected)}`);
                }
            }
            for (const e in expected) {
                if (!(e in models)) {
                    err(`Model ${e} was expected in view but is missing`);
                }
            }
        }

        for (const m in models) {
            models[m].register(this);
        }
        this.#models = models;
        this.create();
    }

    get ui() {
        return this.#ui;
    }
    set ui(ui) {
        this.#ui = ui;
    }

    model(name) {
        return this.#models[name];
    }
    data(name) {
        return this.#models[name].get();
    }
    modeldata(name) {
        return [model[name], data[name]];
    }


    models() { return null }
    create() {
        this.ui = $();
    }
    update() { }

    show() {
        this.ui.show();
    }
    hide() {
        this.ui.hide();
    }
    destroy() {
        this.ui.remove();
    }
}


export class PersonView_list extends MirraView {
    models() {
        return { person: true }    // name of model and whether it's mandatory or not
    }
    create() {
        this.view = $(`<b>`);
    }
    update() {
        // const mPerson = model('person'), dPerson = mPerson.get();
        const [mPerson, dPerson] = modeldata('person');
        this.view.text(dPerson.name);
    }
}


window.PersonView_list = PersonView_list;



// let view = $(`<div style="border: 1px solid grey; border-radius: 8px; padding: 8px; margin: 8px;">`);
// let table = $(`<table>`).appendTo(view);
// table.append($(`<tr><th>id</th><td>${this.#key}</td></tr>`));
// for (d in this.#_data) {
//     table.append($(`<tr><th>${d}</th><td>${this.#_data[d]}</td></tr>`));
// }
// this.#views[type] = view;
