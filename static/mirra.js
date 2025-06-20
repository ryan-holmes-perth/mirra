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



export class MirraConsumer {
    #cls;
    #callback;
    #sort;
    #filter;
    #items;
    #itemsDone;

    constructor(cls, callback = null, sort = null, filter = null) {
        this.#cls = cls;
        this.#callback = callback;
        this.#sort = sort;
        this.#filter = filter;

        console.log(cls.itemsPath, cls.itemPath);
        bus.on(cls.itemsPath, () => this.provide());
        bus.on(cls.itemsPath + "/*", () => this.provide());

        this._aaa = crypto.randomUUID().substring(0, 4);

        this.provide();
    }

    setCallback(callback) {
        this.#callback = callback;
    }

    items() {
        return this.#itemsDone;
    }

    async provide() {
        await this.#cls.fetch(true);
        this.#items = this.#cls.map()
        this.#itemsDone = this._filter(this.#items, 'and', this.#filter);
        console.log(this._aaa, this.#itemsDone);
        // this._sort();
        if (this.#callback) this.#callback(this.#itemsDone);
    }

    _filter(i, type, value) {
        let items = { ...i };
        let result = {};
        switch (type) {
            case 'or':
                for (let v in value) {
                    result = {
                        ...result,
                        ...this._filter(items, v, value[v])
                    };
                }
                break;
            case 'and':
                result = items;
                for (let v in value) {
                    let andMap = this._filter(items, v, value[v]);
                    for (let r in result) {
                        if (!(r in andMap)) {
                            delete result[r];
                        }
                    }
                }
                break;
            case 'not':
                result = items;
                for (let v in value) {
                    let notMap = this._filter(items, v, value[v]);
                    for (let n in notMap) {
                        delete result[n];
                    }
                }
                // console.log(result);
                break;
            default:
                for (let i in items) {
                    let itemValue = items[i].get()[type];

                    switch (typeof value) {
                        case 'string':
                            if (itemValue == value) {
                                result[i] = items[i];
                            }
                            break;
                        case 'number':
                            if (itemValue == value) {
                                result[i] = items[i];
                            }
                            break;
                        case 'object':
                            if (value instanceof RegExp) {
                                if (itemValue.match(value)) {
                                    result[i] = items[i];
                                }
                            } else if (value instanceof Array && value.length == 2) {
                                if (itemValue >= value[0] && itemValue <= value[1]) {
                                    result[i] = items[i];
                                }
                            }
                            break;
                    }
                }
                break;
        }
        return result;
    }

    _sort() {
    }
}


export class MirraModel {

    static #settings = new MirraSettings();

    #persisted = false;
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

    static {
    }

    static get settings() {
        return MirraModel.#settings;
    }

    static #registry = new Map();

    static #getItems(cls) {
        return MirraModel.#registry.get(cls);
    }

    static item(id) {
        return MirraModel.#getItems(this)?.[id] ?? null;
    }

    static items() {
        return Object.values(MirraModel.#getItems(this) ?? {});
    }

    static map() {
        return MirraModel.#getItems(this) ?? {};
    }

    constructor(data = this.default, key = null, notify = true) {
        // console.log(data);
        const cls = this.constructor;

        if (!MirraModel.#registry.has(cls)) {
            MirraModel.#registry.set(cls, {});
        }

        if (!MirraModel._initialised) {
            MirraModel.ws = new ReconnectingWebSocket(data => {
                // console.log.log("[ws]", data);
                if (data.entity) {
                    for (const [k, v] of MirraModel.#registry) {
                        if (data.entity.startsWith(k.itemsPath)) {
                            switch (data.mode) {
                                case 'create':
                                    // console.log.log('...', data.key);
                                    // console.log.log(':::', MirraModel.#registry.get(cls)[data.key]);
                                    if (!MirraModel.#registry.get(cls)[data.key]) {
                                        // console.log.log(';;');
                                        new k(data.data, data.key);
                                    }
                                    break;
                                case 'update':
                                    const o = v[data.entity.split('/')[2]];
                                    // console.log.log("%", o);
                                    o.load();
                                    break;
                                case 'delete':
                                    const od = v[data.entity.split('/')[2]];
                                    // console.log.log("%", od);
                                    od.load();
                                    break;
                            };
                        }
                    }
                }
            });
            MirraModel._initialised = true;
            setTimeout(() => { console.log(MirraModel.#registry) }, 2000);
        }


        if (key) {
            this.#persisted = true;
            this.#key = key;
        } else {
            this.#key = crypto.randomUUID();
        }
        this.set(data);
        MirraModel.#registry.get(cls)[this.#key] = this;

        if (notify) {
            // console.log('n1');
            bus.emit(cls.itemsPath, { event: 'created', key: this.#key, data: this.#_data });
            // console.log('n2');
        }

        // console.log('pc');
    }

    static get type() {
        throw "Subclass must override 'static get type()'";
    }

    get type() {
        return this.constructor.type;
    }

    get key() {
        return this.#key;
    }

    get default() {
        return {};
    }

    static get itemsPath() {
        return `/${this.type}`;
    }

    get itemPath() {
        return `/${this.type}/${this.#key}`;
    }


    get properties() {
        throw new Error('Subclasses must implement the "properties" getter');
    }

    get itemPath() {
        return `/${this.type}/${this.#key}`;
    }


    /* this should all be done by views registering for events on the bus - then models will emit when updated */



    // get views() {
    //     throw new Error('Subclasses must implement the "ui" getter');
    // }

    // register(view) {
    //     this.#views.push(view);
    // }

    // async #refresh() {
    //     for (let view of this.#views) {
    //         view.update();
    //     }
    // }

    // get watchers() {
    //     return {}
    // }

    // #setupWatchers() {
    //     for (const expression in this.watchers) {
    //         const pattern = eval('`' + expression + '`');
    //         bus.on(pattern, (event, data) => {
    //             this.#refresh();
    //             if (data.callback) {
    //                 data.callback(this);
    //             }
    //         });
    //     }
    // }


    static async fetch(initial = false) {
        if (!initial || !this._fetched) {
            // console.log.log('FETCHING!!!');
            this._fetched = true;
            await this._fetch();
        }
    }





    // static #consumers = new Map();

    // // static #getItems(cls) {
    // //     return MirraModel.#registry.get(cls);
    // // }

    // static provide(consumer) {
    //     const cls = this.constructor;

    //     if (!MirraModel.#consumers.get(cls)) {
    //         MirraModel.#consumers.set(cls, []);
    //     }
    //     let consumers = MirraModel.#consumers.get(cls);

    //     consumers.push(consumer);        
    // }

    // static async new(key) {
    //     new this({}, key, false).load();
    // }


    // static async fetchIfAuto() {
    //     // console.log("!!!", this.settings.fetch.auto);
    //     if (this.settings.fetch.auto) {
    //         await this.fetch();
    //     }
    // }


    // get the client version of the data
    get() {
        // console.log.log(this);
        return {
            '#key': this.#key,
            ...this.#_data
        };
    }

    // set the client version of the data
    set(data) {
        // chaining method to enable a .save() on the back of it
        this.#_data = {
            ...this.#_data,
            ...data,
            _t: Date.now(),
            _u: browserId(),
            _x: false
        };
        // console.log(this.itemPath);
        bus.emit(this.itemPath, { event: 'updated', data: this.#_data });
        return this;
    }

    // load data from server and sync with client object
    async load() {
        // let t = this.#_t, u = this.#_u;
        this.#data = await this._read();


        // if (t && u && (t != this.#_t || u != this.#_u)) {
        //     // handle conflicts
        //     if (confirm('remote object was updated - overwrite your changes?')) {
        //         Object.assign(this.#_data, this.#data);
        //     }
        // } else {
        Object.assign(this.#_data, this.#data);
        // }
        this.#persisted = true;

        // console.log.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$", this.#_data);
        // console.log(this.#data);
        // console.log.log(this);
        bus.emit(this.itemPath, { event: 'updated', data: this.#_data });
    }

    // save data to server 
    async save() {
        // console.log(1);
        bus.emit(this.itemPath, { event: 'saving', data: this.#_data });

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
            await this._update(this.#_data);
        } else {
            await this._create(this.#_data);
            this.#persisted = true;
        }
        // }

        bus.emit(this.itemPath, { event: 'saved', data: this.#_data });

        // this.load(); - let the socket message update it

    }

    // revert client data back to the saved server data
    async revert() {
        Object.assign(this.#_data, this.#data);
        bus.emit(this.itemPath, { event: 'updated', data: this.#_data });
    }

    async undo() {
        // no parameters: undo last change
        // int parameter: undo last n changes
        // datetime parameter: undo until then
    }

    async delete() {
        const data = this.#_data;
        bus.emit(this.itemPath, { event: 'deleting', data: data });
        await this._delete();
        // mark the view(s) as deleted - which may mean invisible, or greyed out, or ...etc...
        bus.emit(this.itemPath, { event: 'deleted', data: data });
    }

    static async _fetch(data) { }
    async _create(data) { }
    async _read() { }
    async _update(data) { }
    async _delete() { }

}


export class MirraModelMongoDB extends MirraModel {
    static async _fetch() {
        // console.log("^^^^^^^");
        // fetch records according to the criteria and/or policies
        const result = await fetch("/" + this.type, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });
        if (check(result)) {
            const datas = await result.json();
            // console.log("*****", datas);
            // return data;
            for (const data of datas) {
                new this(data, data._id);
            }
        }
    }
    async _create(data) {

        const result = await fetch("/" + this.type, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...data,
                _id: this.key
            })
        });
        if (check(result)) {
            const data = await result.json();
            // console.log("###", data);
        }
    }
    async _read() {
        // console.log(1, `/${this.type}/${this.key}`);
        const result = await fetch(`/${this.type}/${this.key}`);
        // console.log(2, result);
        let data = await result.json();
        // console.log(3, data);
        return data;
    }
    async _update(data) {
        // console.log(1, `/${this.type}/${this.key}`);
        // console.log({            ...data,            _id: this.key,        });
        await fetch(`/${this.type}/${this.key}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...data,
                _id: this.key,
            })
        });
    }
    async _delete() {
        // maybe mark a deleted flag rather than remove, so can be recovered / undone ?
        await fetch(`/${this.type}/${this.key}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: this.key,
            })
        });


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



    willUpdate(changedProperties) {
        const cls = this.constructor;
        for (let t in cls.properties) {
            if (this[t] instanceof MirraConsumer) {
                this[t].setCallback(() => this.requestUpdate());
            } else {
                console.log(t, this[t]?.itemPath, () => this.requestUpdate());
                if (this[t]?.itemPath) {
                    if (changedProperties.has(t)) {
                        if (this[t].itemPath !== this.#ls[t]) {
                            // Remove old listener and add new one
                            if (this.#ls[t]) {
                                bus.off(this.#ls[t], () => this.requestUpdate());
                            }
                            this.#ls[t] = this[t].itemPath;
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
        const value = model.get()?.[modelProperty] || '';
        console.log(value);
        const tabIndex = ++MirraView.#tabIndex;

        if (config.type === 'select') {
            return html`
                <div tabIndex=${tabIndex}>
                    <select
                    class="s-mediaType"
                    .value=${value}
                    @change=${(e) => {
                    const val = e.target.value;
                    model.set({ [modelProperty]: val }).save();
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
        console.log(value);

        // Create a dynamic element tag using Lit's `html`
        // This works because Lit allows tag name interpolation with caution
        return html`
            <div
            style="display: inline-block"
            class="editable"
            tabIndex=${tabIndex}
            @focus=${(e) => {
                MirraEdit.edit(e.target, (x) => {
                    model.set({ [modelProperty]: x }).save();
                });
            }}
            >${value}</div>
        `;
    }
}


export class __MirraView {
    #models;
    #ui;
    static #tabIndex = 100;
    static _views = {};
    static _uiGroup = {};

    constructor(models = {}) {
        const cls = this.constructor;  // 🔁 Access the static context

        // console.log("_____", cls._initialised);
        MirraView._init(cls);

        // console.log("$$$", models);

        // validate
        const expected = cls.expects?.();  // ✅ Call static method from class, not instance
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

                // bus.on(models[e].constructor.itemsPath, cls.groupUpdate);
            }
        }

        this.#models = models;
        if (MirraView._views[cls][this.id]) {
            // console.log.log("...view already exists");
        } else {
            for (const m in models) {
                // console.log.log("---", models[m].itemPath);
                bus.on(models[m].itemPath, (data) => {
                    // console.log.log(models[m].itemPath, this);
                    if (data.event == 'updated') {
                        // console.log.log('!!! YEAH !!!');
                        this.update();
                    }
                    if (data.event == 'deleted') {
                        // console.log.log('!!! NAH !!!');
                        this.update();
                    }
                });
            }


            // console.log.log("$$$", this.#models);
            this.create()
            this.update(); // why not chained before work?
            MirraView._views[cls][this.id] = this;
            cls.updateGroup();

            // console.log(this.id);
            // console.log(MirraView._views);
        }
    }

    get id() {
        return Object.values(this.#models).reduce((s, item) => s + item.itemPath, ":");
    }

    static _init(cls) {
        // console.log(cls);
        if (!cls._initialised) {
            if (!MirraView._views[cls]) {
                MirraView._views[cls] = {};
            }

            cls.createGroup();
            // console.log.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
            const expected = cls.expects();
            for (const e in expected) {
                // console.log.log(expected[e].itemsPath);
                bus.on(expected[e].itemsPath, data => {
                    if (data.event == 'created') {
                        // console.log(expected[e].item(data.key));
                        // console.log("!"); 
                        //const cls = this.constructor; 
                        // console.log(cls); 
                        // // MirraView.new(expected[e], data.key);
                        if (MirraView._views[cls][data.key]) {
                            // console.log.log("...view already exists!!!");
                        } else {
                            new cls({ [e]: expected[e].item(data.key) });
                        }
                    }
                });
            }
            // console.log(bus);
            cls._initialised = true;
        }

    }

    static async init(cls, selector) {
        MirraView._init(this);

        this.fetch(cls, true);
        // this.fill(cls);
        this.to(selector);
    }

    // static async new(cls, key) {
    //     const item = await cls.new(key);
    //     // const type = Object.keys(cls.expects())[0];
    //     new this({ person: item });

    // }

    // static async refreshGroup(cls) {
    //     await cls.fetch(cls);
    //     cls.fill(cls);
    // }

    static async fetch(cls, initial = false) {
        await cls.fetch(initial);
    }

    // static fill(cls) {
    //     const type = Object.keys(this.expects())[0];
    //     // console.log(type);
    //     // console.log("###", cls.constructor.name, cls.items());

    //     cls.items().forEach(item => {
    //         // const data = {};
    //         // data[type] = item;
    //         // // console.log(data);
    //         // // console.log({ [type] : item });
    //         new this({ [type]: item });
    //     });

    //     // this.updateGroup();
    // }

    static to(selector) {
        // const cls = this.constructor;
        // console.log.log(this.uiGroup, $(selector));
        this.uiGroup.appendTo(selector);
        // console.log.log(this.uiGroup, $(selector));
    }

    get ui() {
        return this.#ui;
    }
    set ui(ui) {
        this.#ui = ui;
    }

    static get uiGroup() {
        if (!MirraView._uiGroup[this]) {
            this.createGroup();
        }
        return MirraView._uiGroup[this];
    }
    static set uiGroup(uiGroup) {
        MirraView._uiGroup[this] = uiGroup;
    }

    static get views() {
        return Object.values(MirraView._views[this] ?? {});
    }

    model(name) {
        return this.#models[name];
    }
    data(name) {
        // console.log.log(this.#models);
        return this.#models[name].get();
    }
    modeldata(name) {
        return [this.model(name), this.data(name)];
    }

    static expects() {
        return null;
    }

    static createGroup() {
        this.uiGroup = $();
    }
    static updateGroup() {
        // console.log(1111);
        return this;
    }

    create() {
        this.ui = $();
        return this;
    }
    update() {
        // console.log.log("*1*");
        return this;
    }

    show() {
        this.ui.show();
        return this;
    }
    hide() {
        this.ui.hide();
        return this;
    }
    destroy() {
        this.ui.remove();
        return this;
    }

    editable(modelId, modelProperty, config = {}) {
        let $ui;
        switch (config.type) {
            case 'select':
                const $sel = $('<select>')
                    .addClass('s-mediaType')
                    .val(this.data(modelId)[modelProperty] || '')
                    .on('change', (e) => {
                        const val = $(e.target).val();
                        this.model(modelId).set({ [modelProperty]: val }).save();
                    })
                    ;
                for (let k of Object.keys(config.options)) {
                    const v = config.options[k];
                    // console.log.log(k, v);
                    $sel.append($(`<option value="${k}">${v}</option>`));
                }
                $ui = $('<div>').append($sel);
                $ui.attr('tabIndex', ++MirraView.#tabIndex);
                break;
            default:
                $ui = $(config.html ?? '<div>')
                    .addClass('editable')
                    .on('focus',
                        (e) => {
                            MirraEdit.edit(e.target,
                                x => {
                                    this.model(modelId).set({ [modelProperty]: x }).save();
                                }
                            )
                        }
                    )
                    ;
                $ui.attr('tabIndex', ++MirraView.#tabIndex);
                break;
        }
        return $ui;
    }
}



export class MirraEdit {
    static edit(elem, callback, deleteCallback) {
        // console.log.log(deleteCallback);
        const o = $($(elem).closest('.editable'));
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
                    // console.log(callback);
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
    const base = mitt();
    const wildcardHandlers = [];
    const seenEventIds = new Set();

    const patternToRegex = (pattern) =>
        new RegExp(
            '^' +
            pattern
                .split('*')
                .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('.*') +
            '$'
        );

    // Helper to get or assign a unique id to an event
    function getEventId(type, event) {
        if (event && event._eventId) {
            return event._eventId;
        }
        // Compose a unique id: type + timestamp + random
        const id = `${type}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        if (event && typeof event === 'object') {
            event._eventId = id;
        }
        return id;
    }

    return {
        on(type, handler) {
            console.log("%%%%%%%", type, handler);
            // console.trace();
            if (type.includes('*')) {
                const regex = patternToRegex(type);
                wildcardHandlers.push({ pattern: type, regex, handler });
            } else {
                base.on(type, (event) => {
                    // Only fire if this event id hasn't been seen
                    // if (!seenEventIds.has(event._eventId)) {
                    console.log("!", event, type, handler);
                    handler(event, type);
                    // seenEventIds.add(event._eventId);
                    // }
                });
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
            // Assign or get unique event id
            event._eventId = getEventId(type, event);
            // if (seenEventIds.has(event._eventId)) {
            //     // Already handled this event, skip
            //     return;
            // }

            // Emit to base mitt
            base.emit(type, event);

            // Emit to wildcard handlers
            for (const { regex, handler } of wildcardHandlers) {
                if (regex.test(type)) {
                    handler(event, type);
                }
            }
        },
    };
}
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

