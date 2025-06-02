export class MirraModel {

    #key = null;
    #data = {};

    static #registry = new WeakMap();

    static #getItems(cls) {
        return MirraModel.#registry.get(cls);
    }

    static item(id) {
        return MirraModel.#getItems(this)?.[id] ?? null;
    }

    static items() {
        return Object.values(MirraModel.#getItems(this) ?? {});
    }

    constructor(data = this.default) {
        const cls = this.constructor;

        if (!MirraModel.#registry.has(cls)) {
            MirraModel.#registry.set(cls, {});
        }

        this.#key = crypto.randomUUID();
        this.set(data);
        MirraModel.#registry.get(cls)[this.#key] = this;
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


    set(data) {
        this.#data = data;
    }

    get data() {
        return this.#data;
    }
}
