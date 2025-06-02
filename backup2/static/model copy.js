import { DateTime, Duration } from 'https://esm.sh/luxon';
import $ from 'https://esm.sh/jquery';
import mitt from 'https://esm.sh/mitt';


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


export function browserId() {
    const key = 'anonymousUserId';
    let id = localStorage.getItem(key);
    if (!id) {
        id = crypto.randomUUID(); // Supported in modern browsers
        localStorage.setItem(key, id);
    }
    return id;
}


export class MirraModel {

    #key = null;
    #_data = {};
    #data = {};
    #views = [];

    #persisted = false;

    constructor(key, data) {
        data = data || {};

        if (this.#persisted) {
            this.#key = key;

            if (Object.keys(data).length == 0) {
                // if no data provided, load it from the db
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

    register(view) {
        this.#views.push(view);
    }

    async #refresh() {
        for (let view of this.#views) {
            view.update();
        }
    }

    async #create(data) {
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
        await this.#read();
        Object.assign(this.#_data, this.#data);
        this.#refresh();
    }

    // save data to server 
    async save() {
        if (this.#persisted) {
            await this.#update(this.#_data);
        } else {
            await this.#create(this.#_data);
        }
    }

    // revert client data back to the saved server data
    async revert() {
        Object.assign(this.#_data, this.#data);
        this.#refresh();
    }

    async delete() {
        await this.#delete();
        // mark the view(s) as deleted - which may mean invisible, or greyed out, or ...etc...
        this.#refresh();
    }
}


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

