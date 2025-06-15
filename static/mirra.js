import { DateTime, Duration } from 'https://esm.sh/luxon';
import { html, LitElement } from 'https://esm.sh/lit';
import $ from 'https://esm.sh/jquery';
import mitt from 'https://esm.sh/mitt';


class ReconnectingWebSocket {
    constructor(callback) {
        this.url = `ws://${location.host}/ws`;
        this.callback = callback;
        this.ws = null;
        this.backoff = 1000;      // 1 second
        this.maxBackoff = 30000;  // 30 seconds
        this.pingInterval = null;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            // console.log.log("WebSocket connected");
            this.backoff = 1000; // reset backoff

            // Send heartbeat pings every 30 seconds
            // this.pingInterval = setInterval(() => {
            //     if (this.ws.readyState === WebSocket.OPEN) {
            //         // this.ws.send(JSON.stringify({ type: "pong" })); // send pong to server ping
            //     }
            // }, 30000);
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // console.log("&&&&&&&&&&&&", data);
            if (data.type === "ping") {
                // Server ping received, reply pong immediately
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ action: "pong" }));
                }
            } else {
                this.callback(data);
            }
        };

        this.ws.onclose = () => {
            // console.log.log("WebSocket closed, reconnecting...");
            clearInterval(this.pingInterval);
            this.reconnect();
        };

        this.ws.onerror = (err) => {
            // console.log.error("WebSocket error", err);
            this.ws.close();
        };
    }

    reconnect() {
        setTimeout(() => {
            // console.log.log(`Reconnecting in ${this.backoff} ms...`);
            this.connect();
            this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
        }, this.backoff);
    }
}

// const ws = new ReconnectingWebSocket();


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

window.seq = 1;


export class MirraSettings {
    constructor(settings = {}) {
        this.fetch = {
            ...this.fetch,
            ...settings.fetch
        }
    }

    fetch = {
        auto: true
    };

    // undo = {
    //     client: {
    //         enabled: false,
    //         maxLevels: 10,
    //         maxDuration: new Duration({ hours: 2 }),
    //         onsave: 'clear'   // or 'keep' or 'flatten' ?
    //     },
    //     server: {
    //         enabled: false,
    //         maxLevels: 10,
    //         maxDuration: new Duration({ hours: 2 })
    //     }
    // };

    // sync = {
    //     delay: new Duration({ seconds: 5 }),
    //     between: new Duration({ seconds: 15 })
    // };

    // rel = {
    //     parent: {
    //         type: "",
    //         property: ""
    //     },
    //     children: [
    //         {
    //             type: "",
    //             property: ""
    //         }
    //     ],
    //     related: [
    //         {
    //             type: "",
    //             property: ""
    //         }
    //     ]
    // };
}



export class MirraList {
    #cls;
    #callbacks;
    #sort;
    #filter;
    #fetching;
    #items = new Map();
    // #itemsDone;

    constructor(cls, filter = {}, sort = {}, ...callbacks) {
        this.#cls = cls;
        this.#callbacks = [...callbacks];
        this.#sort = sort;
        this.#filter = filter;


        // this._aaa = crypto.randomUUID().substring(0, 4);

        Store.addFilter(cls, filter);
        this.#fetching = this.#cls.fetch(filter, sort).then(x => {
            this.#items = Sort.sort(x, this.#sort);
            this.#triggerCallbacks();

            // bus.on(cls.modelPath, (e) => this._event(e));
            bus.on(`${cls.modelPath}/*`, (e) => this._event(e));
        });
    }


    // Make it iterable
    [Symbol.iterator]() {
        return this.#items.values();
    }

    size() {
        return this.#items.size;
    }

    // === Array-like methods ===

    map(callback) {
        return (this.#items.values() ?? []).map(callback);
    }

    filter(callback) {
        return (this.#items.values() ?? []).filter(callback);
    }

    forEach(callback) {
        return (this.#items.values() ?? []).forEach(callback);
    }

    reduce(callback, initialValue) {
        return (this.#items.values() ?? []).reduce(callback, initialValue);
    }


    addCallback(callback) {
        this.#callbacks.push(callback);
    }
    #triggerCallbacks() {
        this.#callbacks.forEach(callback => {
            console.log("    trigger\n    ", callback);
            callback();
        });
    }

    _event(e) {
        console.log('  event:\n  ', e);

        let changed = false;

        // console.log(e);
        switch (e.event) {
            case 'created':
                console.log(this.#cls.name, e.data);
                if (Filter.pass(e.data, this.#filter, Filter.CLIENT)) {
                    console.log("YES");
                    this.#items.set(e.data.id, e.data);
                    changed = true;
                }
                console.log(this.#items);
                break;
            case 'updating':
                break;
            case 'updated':
                const o = this.#items.get(e.data.id);
                const pass = Filter.pass(e.data, this.#filter, Filter.CLIENT);
                if (o && !pass) {
                    this.#items.delete(e.data.id);
                    changed = true;
                } else if (!o && pass) {
                    // console.log("Updating", e.data.id, e.data);
                    this.#items.set(e.data.id, e.data);
                    changed = true;
                } else if (o && pass) {
                    changed = true;
                }
                break;
            case 'deleting':
                break;
            case 'deleted':
                this.#items.delete(e.data.id);
                changed = true;
                break;
        }

        if (changed) {
            setTimeout(() => {
                this.#items = Sort.sort(this.#items, this.#sort);
                this.#triggerCallbacks();
            }, 0);
        }
        // switch (e.event
    }

    // async provide() {
    //     await this.#cls.fetch(this.#filter, this.#sort);
    //     this.#items = this.#cls.map();
    //     this.#itemsDone = this._filter(this.#items, 'and', this.#filter);
    //     console.log(this._aaa, this.#itemsDone);
    //     // this._sort();
    //     if (this.#callback) this.#callback(this.#itemsDone);
    // }


    // _sort() {
    // }
}


export class Filter {
    static SERVER = 'S';
    static CLIENT = 'C';

    static pass(obj, filter, mode = Filter.CLIENT) {
        return this.passForClass(obj.constructor, obj, filter, mode);
    }
    static filter(objs, filter, mode = Filter.CLIENT) {
        if (!objs || objs.size() == 0) return objs;

        return this.filterForClass(objs[0].constructor, objs, filter, mode);
    }

    static passForClass(cls, data, filter, mode = Filter.CLIENT) {
        let id;
        if (data instanceof MirraModel) {
            id = data.id;
        } else {
            // console.log(cls.name, data);
            // console.log('-------------',cls._getIdFromData(data));
            id = cls._getIdFromData(data);
        }
        console.log(`<<<<< ${id} >>>>>`, data);
        const result = this._filter(cls, { [id]: data }, 'and', filter);
        console.log("*******", result);
        return Object.keys(result).length == 1;
    }

    static filterForClass(cls, datas, filter, mode = Filter.CLIENT) {
        return this._filter(cls, datas, 'and', filter);
    }

    static _filter(cls, i, type, value) {
        let items = { ...i };
        console.log("@", cls.name, items, type);
        let result = {};
        switch (type) {
            case 'or':
                for (let v in value) {
                    result = {
                        ...result,
                        ...this._filter(cls, items, v, value[v])
                    };
                }
                break;
            case 'and':
                result = items;
                console.log(result);
                for (let v in value) {
                    let andMap = this._filter(cls, items, v, value[v]);
                    console.log(andMap);
                    for (let r in result) {
                        console.log(r);
                        if (!(r in andMap)) {
                            console.log('...deleting');
                            delete result[r];
                        }
                    }
                }
                console.log(result);
                break;
            case 'not':
                result = items;
                for (let v in value) {
                    let notMap = this._filter(cls, items, v, value[v]);
                    for (let n in notMap) {
                        delete result[n];
                    }
                }
                // console.log(result);
                break;
            default:
                for (const [id, item] of Object.entries(items)) {
                    // const id = cls._getIdFromData(item);
                    const itemValue = item[type];
                    console.log(item, id, type, itemValue, item.name, item['name']);

                    switch (typeof value) {
                        case 'string':
                            if (itemValue == value) {
                                result[id] = item;
                            }
                            break;
                        case 'number':
                            if (itemValue == value) {
                                result[id] = item;
                            }
                            break;
                        case 'object':
                            if (value instanceof RegExp) {
                                if (itemValue?.match(value)) {
                                    console.log(type, itemValue, value);
                                    result[id] = item;
                                }
                            } else if (value instanceof Array && value.length == 2) {
                                if (itemValue >= value[0] && itemValue <= value[1]) {
                                    result[id] = item;
                                }
                            }
                            break;
                    }
                }
                break;
        }
        console.log(result);
        return result;
    }

}

export class Sort {
    static ASC = Symbol('asc');
    static DESC = Symbol('desc');

    static sort(datas, sort) {
        console.log(">>>",datas);
        // Convert Map to array of [key, value] pairs for sorting
        const entries = Array.from(datas.entries());
        entries.sort(([keyA, a], [keyB, b]) => {
            for (const [key, order] of Object.entries(sort)) {
                const aValue = a[key];
                const bValue = b[key];
                if (aValue === bValue) continue;

                let comparison = 0;
                if (order === Sort.ASC) {
                    comparison = aValue < bValue ? -1 : 1;
                } else if (order === Sort.DESC) {
                    comparison = aValue > bValue ? -1 : 1;
                } else if (Array.isArray(order)) {
                    const [nullsFirst, direction] = order;
                    if (nullsFirst && (aValue === null || bValue === null)) {
                        comparison = aValue === null ? 1 : -1;
                    } else if (direction === Sort.DESC) {
                        comparison = aValue > bValue ? -1 : 1;
                    } else {
                        comparison = aValue < bValue ? -1 : 1;
                    }
                }

                if (comparison !== 0) return comparison;
            }
            return 0;
        });
        // Return a new Map with sorted entries
        console.log("<<<",new Map(entries));
        return new Map(entries);
    }
}

// const result = Sort.sort(MirraView.list(), {
//     name: Sort.ASC,
//     birthdate: [null, Sort.DESC], // nulls first
//     status: ['P', 'A', 'C', null], // sort in specific order, nulls last
// });

//     [Symbol.iterator]() {
//         return this.#items.values();
//     }

// }

/*remove export after testing*/
export class Store {
    static #store = new Map();
    static #paths = new Map();
    static #filters = new Map();

    static {
        Store.ws = new ReconnectingWebSocket(data => {

            /* check here to make sure it's the next message in the sequence */

            // console.log(data);

            if (data.path) {
                // console.log(data.path);
                // console.log(this.#paths);

                const cls = this.#paths.get(data.path);
                const oMap = this.#store.get(cls);

                // console.log(cls, oMap);

                if (oMap) {
                    switch (data.mode) {
                        case 'create':
                            if (!oMap.has(data.id)) {
                                if (Filter.passForClass(cls, data.data, Store.getServerFilter(cls), Filter.SERVER)) {
                                    new cls(data.data, data.id);
                                }
                            }
                            break;
                        case 'update':
                            oMap.get(data.id).update(data.data);
                            break;
                        case 'delete':
                            oMap.get(data.id).update(data.data);  // same as update, as it just sets a delete flag
                            break;
                    };
                }
            }
        });
    }

    static has(cls, id) {
        return this.#store.get(cls)?.has(id) ?? false;
    }

    static get(cls, id) {
        // console.log(cls.name);
        return id ? this.#store.get(cls)?.get(id) : this.#store.get(cls);
    }

    static put(o) {
        const cls = o.constructor;
        if (!this.#store.has(cls)) {
            this.#store.set(cls, new Map());
            this.#paths.set(cls.modelPath, cls);
        }
        this.#store.get(cls).set(o.id, o);
    }

    static addFilter(cls, filter) {
        if (!this.#filters.has(cls)) {
            this.#filters.set(cls, []);
        }
        this.#filters.get(cls).push(filter);
    }
    static getServerFilter(cls) {
        return {
            or: {
                ...cls
            }
        };
    }
}
window.S = Store;

export class MirraModel {

    #persisted = false;
    #_data = new Map();
    #data = new Map();
    #path;



    #changes = [];      // for undoing
    /* e.g.:

        changes = [
            { order: 17, current: false, data: { name='Susan Lasso' }  },
            { order: 18, current: true, data: { name='Susan Laso' }  },
            { order: 21, current: false, data: { age=55 }  },
            { order: 23, current: false, data: { age=54 }  }
        ];

    */

    constructor(data = {}, id = null) {
        const cls = this.constructor;
        this.#definePropertyAccessors();

        data = {
            ...this.constructor.default,
            ...data
        };

        if (id) {
            this.#persisted = true;
        }
        this.create(data, id ?? crypto.randomUUID());

        Store.put(this);
    }

    static get modelPath() {
        throw "Subclass must override 'static get modelPath()'";
    }

    static get properties() {
        throw new Error('Subclasses must override "static get properties()"');
    }

    static get default() {
        return {};
    }

    static list(filter = {}, sort = {}) {
        return new MirraList(this, filter, sort);
    }

    get id() {
        return this.constructor._getIdFromData(this.#_data);
    }
    set id(id) {
        this.constructor._setIdToData(this.#_data, id);
    }
    static _getIdFromData(data) {
        throw new Error('Subclasses must override "_getIdFromData(data)"');
    }
    static _setIdToData(data, id) {
        throw new Error('Subclasses must override "_setIdToData(data,id)"');
    }

    get path() {
        return this.#path;
    }


    #definePropertyAccessors() {
        for (const p of Object.keys(this.constructor.properties)) {
            if (Object.prototype.hasOwnProperty.call(this, p)) continue;

            Object.defineProperty(this, p, {
                get: () => {
                    const value = this.#_data[p];
                    this.onGet?.(p, value);
                    return value;
                },
                set: (value) => {
                    this.onSet?.(p, value);
                    this.#_data[p] = value;
                    bus.emit(this.path, { event: 'updated', data: this });
                },
                enumerable: true,
                configurable: true,
            });
        }
    }


    static async fetch(filter = {}, sort = {}) {
        // if (!this._fetched) {
        // console.log('FETCHING!!!', this.name, this.constructor.name);
        this._fetched = true;
        const datas = await this._fetch(filter, sort);
        // const filteredDatas = Filter.pass(datas, filter);
        const result = new Map();
        for (const data of datas) {
            const id = this._getIdFromData(data);
            // console.log(id);
            // console.log(Store.get(this, id));
            let o = null;
            if (Store.has(this, id)) {
                // console.log(data);
                o = Store.get(this, id)
                o.update(data);
                // console.log(this);
                if (Filter.passForClass(this, data, filter)) {
                    result.set(id, o);
                }
            } else {
                // console.log(data);
                if (Filter.passForClass(this, data, filter)) {
                    o = new this(data, id);
                    result.set(id, o);
                }
            }
        }
        Sort.sort(result, sort);
        return result;
        // }
    }


    // static get items() {
    //     console.log(this.constructor.name);
    //     return Store.get(this.constructor);
    // }

    // set the client version of the data
    create(data, id) {
        // console.log(this.path);
        // chaining method to enable a .save() on the back of it

        // data.forEach((v, k) => this.#_data.set(k, v));
        this.#_data = data;
        this.#_data._s = window.seq++;
        this.#_data._t = Date.now();
        this.#_data._u = browserId();
        this.#_data._x = false;

        this.id = id;
        this.#path = `${this.constructor.modelPath}/${this.id}`;

        console.log("$$$$$$$$$$$$$", data, id);
        bus.emit(this.path, { event: 'created', data: this });
        return this;
    }

    // set the client version of the data
    update(data) {
        // chaining method to enable a .save() on the back of it

        if (data._t === this.#_data._t && data._s === this.#_data._s && data._u === this.#_data._u) {
            // console.log(data, this.#_data);
            // no change
        } else {
            Object.entries(data).forEach(([k, v]) => this.#_data[k] = v);
            this.#_data._s = window.seq++;
            this.#_data._t = Date.now();
            this.#_data._u = browserId();
            this.#_data._x = false;

            bus.emit(this.path, { event: 'updated', data: this });
        }
        return this;
    }

    // load data from server and sync with client object
    // async load() {
    //     // let t = this.#_t, u = this.#_u;
    //     this.#data = await this._read();


    //     // if (t && u && (t != this.#_t || u != this.#_u)) {
    //     //     // handle conflicts
    //     //     if (confirm('remote object was updated - overwrite your changes?')) {
    //     //         Object.assign(this.#_data, this.#data);
    //     //     }
    //     // } else {
    //     Object.assign(this.#_data, this.#data);
    //     // }
    //     this.#persisted = true;

    //     // console.log.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$", this.#_data);
    //     // console.log(this.#data);
    //     // console.log.log(this);
    //     bus.emit(this.itemPath, { event: 'updated', data: this.#_data });
    // }

    // save data to server 
    async save() {
        bus.emit(this.path, { event: 'saving', data: this });

        // conflict handling?

        if (this.#persisted) {
            await this._update(this.#_data);
        } else {
            await this._create(this.#_data);
            this.#persisted = true;
        }
        // }

        bus.emit(this.path, { event: 'saved', data: this });

        // this.load(); - let the socket message update it

    }

    // revert client data back to the saved server data
    async revert() {
        this.#_data = new Map(this.#data);
        bus.emit(this.path, { event: 'updated', data: this });
    }

    async undo() {
        // no parameters: undo last change
        // int parameter: undo last n changes
        // datetime parameter: undo until then
    }

    async delete() {
        const data = { ...this };
        bus.emit(this.path, { event: 'deleting', data: data });
        await this._delete();
        // mark the view(s) as deleted - which may mean invisible, or greyed out, or ...etc...
        bus.emit(this.path, { event: 'deleted', data: data });
    }

    static async _fetch(data) { }
    async _create(data) { }
    async _read() { }
    async _update(data) { }
    async _delete() { }

}


export class MirraModelMongoDB extends MirraModel {
    static async _fetch(filter = {}, sort = {}) {
        // fetch records according to the criteria and/or policies
        const result = await fetch(this.modelPath, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });
        if (check(result)) {
            const datas = await result.json();
            // console.log("*****", datas);
            return datas.map(data => MirraModelMongoDB.#fromServer(data));
        }
    }
    static _getIdFromData(data) {
        return data._id;
    }
    static _setIdToData(data, id) {
        data._id = id;
    }

    static #toServer(data) {
        return {
            ...data,
            name: data.name?.toLowerCase()
        };
    }
    static #fromServer(data) {
        return {
            ...data,
            name: data.name?.toUpperCase()
        };
    }
    async _create(data) {
        // console.log("!!!", data);
        const result = await fetch(this.constructor.modelPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(MirraModelMongoDB.#toServer(data))
        });
        if (check(result)) {
            const x = await result.json();
            // console.log("###", x);
        } else {
            console.error(result);
        }
    }
    async _read() {
        const result = await fetch(this.path);
        let data = await result.json();
        return MirraModelMongoDB.#fromServer(data);
    }
    async _update(data) {
        await fetch(this.path, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(MirraModelMongoDB.#toServer(data))
        });
    }
    async _delete(data) {
        data._x = true;
        await this._update(data);
    }

}



// class Model extends MirraModelMongoDB {
// }


// export class Person extends Model {
//     get type() {
//         return 'persons';
//     }
//     get properties() {
//         return {
//             name: { type: String, length: { min: 2, max: 30 } }
//         };
//     }
// }

// window.Person = Person;



// export class MirraGroup {
//     #views = [];
//     #childViews = [];

//     constructor(childViews = null) {
//         this.#childViews = childViews;
//         this.#setupWatchers();
//     }

//     get type() {
//         throw new Error('Subclasses must implement the "type" getter');
//     }

//     get childViews() {
//         return this.#childViews;
//     }

//     register(view) {
//         this.#views.push(view);
//     }

//     async #refresh() {
//         for (let view of this.#views) {
//             view.update();
//         }
//     }

//     get watchers() {
//         return {}
//     }

//     #setupWatchers() {
//         for (const expression in this.watchers) {
//             const pattern = eval('`' + expression + '`');
//             bus.on(pattern, (event, data) => {
//                 this.#refresh();
//                 if (data.callback) {
//                     data.callback(this);
//                 }
//             });
//         }
//     }

// }


export class MirraView extends LitElement {
    //         constructor(models = {}) {
    //             super();
    //         }

    #ls = {};
    static #tabIndex = 100;

    // connectedCallback() {
    //     const cls = this.constructor;
    //     // console.log("***", cls.name);
    //     // console.trace();
    //     for (let t in cls.properties) {
    //         // console.log(t, this[t]);
    //         if (this[t] instanceof MirraList) {
    //             this[t].addCallback(() => {
    //                 console.log("-*-");
    //                 this.requestUpdate();
    //             });
    //         }
    //     }
    // }

    willUpdate(changedProperties) {
        const cls = this.constructor;
        // console.log("***", cls.name);
        // console.trace();
        for (let t in cls.properties) {
            // console.log(t, this[t]);
            if (this[t] instanceof MirraList) {
                if (!this.#ls[t]) {
                    this[t].addCallback(() => this.requestUpdate());
                    this.#ls[t] = cls.modelPath;
                }
            } else {
                // console.log(t, this[t]?.path, () => this.requestUpdate());
                if (this[t]?.path) {
                    if (changedProperties.has(t)) {
                        if (this[t].path !== this.#ls[t]) {
                            // Remove old listener and add new one
                            if (this.#ls[t]) {
                                bus.off(this.#ls[t], () => this.requestUpdate());
                            }
                            this.#ls[t] = this[t].path;
                            bus.on(this.#ls[t], () => this.requestUpdate());
                        }
                    }
                }
            }
        }
        super.willUpdate(changedProperties);
    }

    // willUpdate(changedProps) {
    //     if (!this.isConnected) return;
    // }
    // requestUpdate(...args) {
    //   if (!this.isConnected) return;
    //   super.requestUpdate(...args);
    // }


    disconnectedCallback() {
        const cls = this.constructor;
        for (let t in cls.properties) {
            if (this.#ls[t]) {
                bus.off(this.#ls[t], () => this.requestUpdate());
            }
        }
        super.disconnectedCallback();
    }

    render() {
        return html``;
    }

    editable(model, modelProperty, config = {}) {
        const value = model[modelProperty] ?? '';
        // console.log(value);
        const tabIndex = ++MirraView.#tabIndex;

        if (config.type === 'select') {
            return html`
                <div tabIndex=${tabIndex}>
                    <select
                    class="s-mediaType"
                    .value=${value}
                    @change=${(e) => {
                    const val = e.target.value;
                    model[modelProperty] = val;
                    model.save();
                }}
                    >
                    ${Object.entries(config.options).map(
                    ([k, v]) => html`<option value=${k}>${v}</option>`
                )}
                    </select>
                </div>
            `;
        }

        // Fallback element type: extract tag from config.html, or default to 'div'
        // console.log(value);

        // Create a dynamic element tag using Lit's `html`
        // This works because Lit allows tag name interpolation with caution
        return html`
            <div
            style="display: inline-block"
            class="editable"
            tabIndex=${tabIndex}
            @focus=${(e) => {
                MirraEdit.edit(e.target, (x) => {
                    model[modelProperty] = x;
                    model.save();
                });
            }}
            >${value}</div>
        `;
    }
}


// export class __MirraView {
//     #models;
//     #ui;
//     static #tabIndex = 100;
//     static _views = {};
//     static _uiGroup = {};

//     constructor(models = {}) {
//         const cls = this.constructor;  // 🔁 Access the static context

//         // console.log("_____", cls._initialised);
//         MirraView._init(cls);

//         // console.log("$$$", models);

//         // validate
//         const expected = cls.expects?.();  // ✅ Call static method from class, not instance
//         if (expected) {
//             for (const m in models) {
//                 if (!(m in expected)) {
//                     err(`Model ${m} not expected in view - expected ${Object.keys(expected)}`);
//                 }
//             }
//             for (const e in expected) {
//                 if (!(e in models)) {
//                     err(`Model ${e} was expected in view but is missing`);
//                 }

//                 // bus.on(models[e].constructor.itemsPath, cls.groupUpdate);
//             }
//         }

//         this.#models = models;
//         if (MirraView._views[cls][this.id]) {
//             // console.log.log("...view already exists");
//         } else {
//             for (const m in models) {
//                 // console.log.log("---", models[m].itemPath);
//                 bus.on(models[m].itemPath, (data) => {
//                     // console.log.log(models[m].itemPath, this);
//                     if (data.event == 'updated') {
//                         // console.log.log('!!! YEAH !!!');
//                         this.update();
//                     }
//                     if (data.event == 'deleted') {
//                         // console.log.log('!!! NAH !!!');
//                         this.update();
//                     }
//                 });
//             }


//             // console.log.log("$$$", this.#models);
//             this.create()
//             this.update(); // why not chained before work?
//             MirraView._views[cls][this.id] = this;
//             cls.updateGroup();

//             // console.log(this.id);
//             // console.log(MirraView._views);
//         }
//     }

//     get id() {
//         return Object.values(this.#models).reduce((s, item) => s + item.itemPath, ":");
//     }

//     static _init(cls) {
//         // console.log(cls);
//         if (!cls._initialised) {
//             if (!MirraView._views[cls]) {
//                 MirraView._views[cls] = {};
//             }

//             cls.createGroup();
//             // console.log.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
//             const expected = cls.expects();
//             for (const e in expected) {
//                 // console.log.log(expected[e].itemsPath);
//                 bus.on(expected[e].itemsPath, data => {
//                     if (data.event == 'created') {
//                         // console.log(expected[e].item(data.key));
//                         // console.log("!"); 
//                         //const cls = this.constructor; 
//                         // console.log(cls); 
//                         // // MirraView.new(expected[e], data.key);
//                         if (MirraView._views[cls][data.key]) {
//                             // console.log.log("...view already exists!!!");
//                         } else {
//                             new cls({ [e]: expected[e].item(data.key) });
//                         }
//                     }
//                 });
//             }
//             // console.log(bus);
//             cls._initialised = true;
//         }

//     }

//     static async init(cls, selector) {
//         MirraView._init(this);

//         this.fetch(cls, true);
//         // this.fill(cls);
//         this.to(selector);
//     }

//     // static async new(cls, key) {
//     //     const item = await cls.new(key);
//     //     // const type = Object.keys(cls.expects())[0];
//     //     new this({ person: item });

//     // }

//     // static async refreshGroup(cls) {
//     //     await cls.fetch(cls);
//     //     cls.fill(cls);
//     // }

//     static async fetch(cls, initial = false) {
//         await cls.fetch(initial);
//     }

//     // static fill(cls) {
//     //     const type = Object.keys(this.expects())[0];
//     //     // console.log(type);
//     //     // console.log("###", cls.constructor.name, cls.items());

//     //     cls.items().forEach(item => {
//     //         // const data = {};
//     //         // data[type] = item;
//     //         // // console.log(data);
//     //         // // console.log({ [type] : item });
//     //         new this({ [type]: item });
//     //     });

//     //     // this.updateGroup();
//     // }

//     static to(selector) {
//         // const cls = this.constructor;
//         // console.log.log(this.uiGroup, $(selector));
//         this.uiGroup.appendTo(selector);
//         // console.log.log(this.uiGroup, $(selector));
//     }

//     get ui() {
//         return this.#ui;
//     }
//     set ui(ui) {
//         this.#ui = ui;
//     }

//     static get uiGroup() {
//         if (!MirraView._uiGroup[this]) {
//             this.createGroup();
//         }
//         return MirraView._uiGroup[this];
//     }
//     static set uiGroup(uiGroup) {
//         MirraView._uiGroup[this] = uiGroup;
//     }

//     static get views() {
//         return Object.values(MirraView._views[this] ?? {});
//     }

//     model(name) {
//         return this.#models[name];
//     }
//     data(name) {
//         // console.log.log(this.#models);
//         return this.#models[name].get();
//     }
//     modeldata(name) {
//         return [this.model(name), this.data(name)];
//     }

//     static expects() {
//         return null;
//     }

//     static createGroup() {
//         this.uiGroup = $();
//     }
//     static updateGroup() {
//         // console.log(1111);
//         return this;
//     }

//     create() {
//         this.ui = $();
//         return this;
//     }
//     update() {
//         // console.log.log("*1*");
//         return this;
//     }

//     show() {
//         this.ui.show();
//         return this;
//     }
//     hide() {
//         this.ui.hide();
//         return this;
//     }
//     destroy() {
//         this.ui.remove();
//         return this;
//     }

//     editable(modelId, modelProperty, config = {}) {
//         let $ui;
//         switch (config.type) {
//             case 'select':
//                 const $sel = $('<select>')
//                     .addClass('s-mediaType')
//                     .val(this.data(modelId)[modelProperty] || '')
//                     .on('change', (e) => {
//                         const val = $(e.target).val();
//                         this.model(modelId).set({ [modelProperty]: val }).save();
//                     })
//                     ;
//                 for (let k of Object.keys(config.options)) {
//                     const v = config.options[k];
//                     // console.log.log(k, v);
//                     $sel.append($(`<option value="${k}">${v}</option>`));
//                 }
//                 $ui = $('<div>').append($sel);
//                 $ui.attr('tabIndex', ++MirraView.#tabIndex);
//                 break;
//             default:
//                 $ui = $(config.html ?? '<div>')
//                     .addClass('editable')
//                     .on('focus',
//                         (e) => {
//                             MirraEdit.edit(e.target,
//                                 x => {
//                                     this.model(modelId).set({ [modelProperty]: x }).save();
//                                 }
//                             )
//                         }
//                     )
//                     ;
//                 $ui.attr('tabIndex', ++MirraView.#tabIndex);
//                 break;
//         }
//         return $ui;
//     }
// }



export class MirraEdit {
    static edit(elem, callback, deleteCallback) {
        // console.log.log(deleteCallback);
        const o = $($(elem).closest('.editable'));
        console.log(o, o.text());
        o.data('_cval', o.text());

        o.attr('contenteditable', true);
        if (!o.is(":focus")) {   // prevents infinite event loop
            o.focus();
        }
        // setTimeout(() => {
        setCursorToStartIfNone(o[0]);
        //  }, 1000);

        if (!o.data('_minit')) {
            o.on('blur', () => {
                o.attr('contenteditable', false);
                o[0].scrollLeft = 0;
                if (o.text() != o.data('_cval')) {
                    console.log("$$$", o.text());
                    callback(o.text());
                }
            });
            o.on('keydown', (e) => {
                if (e.key === "Escape") {
                    o.text(o.data('_cval'));
                    o.attr('contenteditable', false);
                    e.preventDefault();
                }
                if (deleteCallback && e.key === "Delete" && e.shiftKey) {
                    // console.log.log("*");
                    o.text(o.data('_cval'));
                    o.attr('contenteditable', false);
                    deleteCallback();
                }
            });
            o.on('keypress', (e) => {
                if (e.key === "Enter") {
                    o.blur();
                    e.preventDefault();
                }
            });

            o.data('_minit', true);
        }
    }
    // static delete(view, callback) {
    //     const o = $(view.ui.closest('.editable'));
    //     // console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",view,o);
    //     o.data('_cval', o.text());

    //     o.addClass('deleted');

    //     if (!o.data('_minit')) {
    //         o.on('blur', () => {
    //             o.attr('contenteditable', false);
    //             if (o.text() != o.data('_cval')) {
    //                 // console.log(callback);
    //                 callback(o.text());
    //             }
    //         });
    //         o.on('keydown', (e) => {
    //             if (e.key === "Escape") {
    //                 o.text(o.data('_cval'));
    //                 o.attr('contenteditable', false);
    //                 e.preventDefault();
    //             }
    //             if (e.key === "Delete" && e.ctrlKey) {
    //                 console.log("DELETE");
    //             }
    //         });
    //         o.on('keypress', (e) => {
    //             if (e.key === "Enter") {
    //                 o.blur();
    //                 e.preventDefault();
    //             }
    //         });

    //         o.data('_minit', true);
    //     }
    // }
}



// export class PersonView_list extends MirraView {
//     models() {
//         return { person: true }    // name of model and whether it's mandatory or not
//     }
//     create() {
//         this.view = $(`<b>`);
//     }
//     update() {
//         // const mPerson = model('person'), dPerson = mPerson.get();
//         const [mPerson, dPerson] = modeldata('person');
//         this.view.text(dPerson.name);
//     }
// }


// window.PersonView_list = PersonView_list;



// let view = $(`<div style="border: 1px solid grey; border-radius: 8px; padding: 8px; margin: 8px;">`);
// let table = $(`<table>`).appendTo(view);
// table.append($(`<tr><th>id</th><td>${this.#key}</td></tr>`));
// for (d in this.#_data) {
//     table.append($(`<tr><th>${d}</th><td>${this.#_data[d]}</td></tr>`));
// }
// this.#views[type] = view;




function emitter() {
    const handlers = [];

    const patternToRegex = (pattern) =>
        new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

    return {
        on(type, handler) {
            handlers.push({
                pattern: type,
                regex: type.includes('*') ? patternToRegex(type) : null,
                handler
            });
        },
        off(type, handler) {
            for (let i = handlers.length - 1; i >= 0; i--) {
                if (handlers[i].pattern === type && handlers[i].handler === handler) {
                    handlers.splice(i, 1);
                }
            }
        },
        emit(type, event) {
            for (const { pattern, regex, handler } of handlers) {
                // console.log(type, pattern, regex, handler);
                const matches = regex ? regex.test(type) : pattern === type;
                if (matches) {
                    // console.log("EMIT ==>\n", type, event);
                    handler(event, type);
                }
            }
        }
    };
}



// function emitter() {
//     const base = mitt();
//     const wildcardHandlers = [];
//     const seenEventIds = new Set();

//     const patternToRegex = (pattern) =>
//         new RegExp(
//             '^' +
//             pattern
//                 .split('*')
//                 .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
//                 .join('.*') +
//             '$'
//         );

//     // Helper to get or assign a unique id to an event
//     function getEventId(type, event) {
//         if (event && event._eventId) {
//             return event._eventId;
//         }
//         // Compose a unique id: type + timestamp + random
//         const id = `${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
//         if (event && typeof event === 'object') {
//             event._eventId = id;
//         }
//         return id;
//     }

//     return {
//         on(type, handler) {
//             // console.log("%%%%%%%", type, handler);
//             // console.trace();
//             if (type.includes('*')) {
//                 const regex = patternToRegex(type);
//                 wildcardHandlers.push({ pattern: type, regex, handler });
//             } else {
//                 base.on(type, (event) => {
//                     // Only fire if this event id hasn't been seen
//                     // if (!seenEventIds.has(event._eventId)) {
//                     console.log("!", event, type, handler);
//                     handler(event, type);
//                     // seenEventIds.add(event._eventId);
//                     // }
//                 });
//             }
//         },
//         off(type, handler) {
//             if (type.includes('*')) {
//                 for (let i = wildcardHandlers.length - 1; i >= 0; i--) {
//                     const h = wildcardHandlers[i];
//                     if (h.pattern === type && h.handler === handler) {
//                         wildcardHandlers.splice(i, 1);
//                     }
//                 }
//             } else {
//                 base.off(type, handler);
//             }
//         },
//         emit(type, event) {
//             // Assign or get unique event id
//             event._eventId = getEventId(type, event);
//             // if (seenEventIds.has(event._eventId)) {
//             //     // Already handled this event, skip
//             //     return;
//             // }

//             // Emit to base mitt
//             base.emit(type, event);
//             console.log(type,event);

//             // Emit to wildcard handlers
//             for (const { regex, handler } of wildcardHandlers) {
//                 if (regex.test(type)) {
//                     handler(event, type);
//                 }
//             }
//         },
//     };
// }
export const bus = emitter();



function setCursorToStartIfNone(contentEditableElement) {
    const selection = window.getSelection();

    if (contentEditableElement) {
        // If selection is not inside the element or is collapsed outside it
        if (
            !selection.rangeCount ||
            !contentEditableElement.contains(selection.anchorNode)
        ) {
            const range = document.createRange();
            range.setStart(contentEditableElement, 0);
            range.collapse(true); // collapse to start

            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
}
