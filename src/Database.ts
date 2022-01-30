import mongoose, { NativeError } from "mongoose";
import modelSchema, { CollectionInterface } from "./collection";
import { TypedEmitter } from "tiny-typed-emitter";
import { Util } from "./Util";
import _ from "lodash";

/**
 * This object also accepts mongodb options
 * @typedef {Object} QuickMongoOptions
 * @property {?string} [collectionName="JSON"] The collection name
 * @property {?boolean} [child=false] Instantiate as a child
 * @property {?Database} [parent=false] Parent db
 * @property {?boolean} [shareConnectionFromParent=false] Share db connection
 */

export interface QuickMongoOptions extends mongoose.ConnectOptions {
    collectionName?: string;
    child?: boolean;
    parent?: Database;
    shareConnectionFromParent?: boolean;
}

/**
 * @typedef {Object} AllQueryOptions
 * @property {?number} [limit=0] The retrieval limit (0 for infinity)
 * @property {?string} [sort] The target to sort by
 * @property {?Function} [filter] The filter: `((data, index) => boolean)`
 */
export interface AllQueryOptions<T = unknown> {
    limit?: number;
    sort?: string;
    filter?: (data: AllData<T>, idx: number) => boolean;
}

/**
 * @typedef {Object} AllData
 * @property {string} ID The id/key
 * @property {any} data The data
 */
export interface AllData<T = unknown> {
    ID: string;
    data: T;
}

/**
 * Document Type, mongoose document
 * @typedef {Object} DocType
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocType<T = unknown> = mongoose.Document<any, any, CollectionInterface<T>> &
    CollectionInterface<T> & {
        _id: mongoose.Types.ObjectId;
    };

interface QmEvents<V = unknown> {
    ready: (db: Database<V>) => unknown;
    connecting: () => unknown;
    connected: () => unknown;
    open: () => unknown;
    disconnecting: () => unknown;
    disconnected: () => unknown;
    close: () => unknown;
    reconnected: () => unknown;
    error: (error: NativeError) => unknown;
    fullsetup: () => unknown;
    all: () => unknown;
    reconnectFailed: () => unknown;
}

/**
 * The Database constructor
 * @extends {EventEmitter}
 */
export class Database<T = unknown, PAR = unknown> extends TypedEmitter<QmEvents<T>> {
    public connection: mongoose.Connection;
    public parent: Database<PAR> = null;
    private __child__ = false;
    // eslint-disable-next-line @typescript-eslint/ban-types
    public model: mongoose.Model<CollectionInterface<T>, {}, {}, {}> = null;

    /**
     * Creates new quickmongo instance
     * @param {string} url The database url
     * @param {QuickMongoOptions} [options={}] The database options
     */
    public constructor(public url: string, public options: QuickMongoOptions = {}) {
        super();

        Object.defineProperty(this, "__child__", {
            writable: true,
            enumerable: false,
            configurable: true
        });

        /**
         * The model
         * @name Database#model
         * @type {?Model}
         */

        /**
         * The connection
         * @name Database#connection
         * @type {?Connection}
         */

        /**
         * The database url
         * @name Database#url
         * @type {string}
         */

        /**
         * The options
         * @name Database#options
         * @type {?QuickMongoOptions}
         */
    }

    /**
     * If this is a child database
     * @returns {boolean}
     */
    public isChild() {
        return !this.isParent();
    }

    /**
     * If this is a parent database
     * @returns {boolean}
     */
    public isParent() {
        return !this.__child__;
    }

    /**
     * If the database is ready
     * @type {boolean}
     */
    public get ready() {
        return this.model && this.connection ? true : false;
    }

    /**
     * Database ready state
     * @type {number}
     */
    public get readyState() {
        return this.connection?.readyState ?? 0;
    }

    /**
     * Get raw document
     * @param {string} key The key
     * @returns {Promise<DocType>}
     * @private
     */
    public async getRaw(key: string): Promise<DocType<T>> {
        this.__readyCheck();
        if(!key || typeof key !== "string") return new Error("No Key added")
        const doc = await this.model.findOne({
            ID: Util.getKey(key)
        });

        // return null if the doc has expired
        // mongodb task runs every 60 seconds therefore expired docs may exist during that timeout
        // this check fixes that issue and returns null if the doc has expired
        // letting mongodb take care of data deletion in the background
        if (!doc || (doc.expireAt && doc.expireAt.getTime() - Date.now() <= 0)) {
            return null;
        }

        return doc;
    }

    /**
     * Get item from the database
     * @param {string} key The key
     * @returns {Promise<any>}
     */
    public async get<V = T>(key: string): Promise<V> {
        if(!key || typeof key !== "string") return new Error("No Key added");
        const res = await this.getRaw(key);
        const formatted = this.__formatData(res);
        return Util.pick(formatted, key) as unknown as V;
    }
    
    /**
     * Get item from the database while filtering the Data
     * @param {string} key The key
     * @returns {Promise<any>}
     */
    public async filter<V = T>(key: string, value: unknown | unknown[]): Promise<V> {
        if(!key || typeof key !== "string") return new Error("No Key added");
        const res = await this.getRaw(key);
        const formatted = this.__formatData(res);
        
        // allow db.remove(key, d); and: db.remove(key, data => data.foo == "bar") 
        const FilterFunction = _.isFunction(value) ? value : (v) => value === v;
        
        const Data = Util.pick(formatted, key) as unknown as V;
        return Data.filter(FilterFunction)
    }

    /**
     * Get item from the database
     * @param {string} key The key
     * @returns {Promise<any>}
     */
    public async fetch<V = T>(key: string): Promise<V> {
        return await this.get(key);
    }

    /**
     * Set item in the database
     * @param {string} key The key
     * @param {any} value The value
     * @param {?number} [expireAfterSeconds=-1] if specified, quickmongo deletes this data after specified seconds.
     * Leave it blank or set it to `-1` to make it permanent.
     * <warn>Data may still persist for a minute even after the data is supposed to be expired!</warn>
     * Data may persist for a minute even after expiration due to the nature of mongodb. QuickMongo makes sure to never return expired
     * documents even if it's not deleted.
     * @returns {Promise<any>}
     * @example // permanent
     * await db.set("foo", "bar");
     *
     * // delete the record after 1 minute
     * await db.set("foo", "bar", 60); // time in seconds (60 seconds = 1 minute)
     */
    public async set(key: string, value: T | unknown, expireAfterSeconds = -1): Promise<T> {
        this.__readyCheck();
        if (!key.includes(".")) {
            await this.model.findOneAndUpdate(
                {
                    ID: key
                },
                {
                    $set: Util.shouldExpire(expireAfterSeconds)
                        ? {
                              data: value,
                              expireAt: Util.createDuration(expireAfterSeconds * 1000)
                          }
                        : { data: value }
                },
                { upsert: true }
            );

            return await this.get(key);
        } else {
            const keyMetadata = Util.getKeyMetadata(key);
            const existing = await this.model.findOne({ ID: keyMetadata.master });
            if (!existing) {
                await this.model.create(
                    Util.shouldExpire(expireAfterSeconds)
                        ? {
                              ID: keyMetadata.master,
                              data: _.set({}, keyMetadata.target, value),
                              expireAt: Util.createDuration(expireAfterSeconds * 1000)
                          }
                        : {
                              ID: keyMetadata.master,
                              data: _.set({}, keyMetadata.target, value)
                          }
                );

                return await this.get(key);
            }

            if (existing.data !== null && typeof existing.data !== "object") throw new Error("CANNOT_TARGET_NON_OBJECT");

            const prev = Object.assign({}, existing.data);
            const newData = _.set(prev, keyMetadata.target, value);

            await existing.updateOne({
                $set: Util.shouldExpire(expireAfterSeconds)
                    ? {
                          data: newData,
                          expireAt: Util.createDuration(expireAfterSeconds * 1000)
                      }
                    : {
                          data: newData
                      }
            });

            return await this.get(keyMetadata.master);
        }
    }

    /**
     * Returns false if the value is nullish, else true
     * @param {string} key The key
     * @returns {Promise<boolean>}
     */
    public async has(key: string) {
        const data = await this.get(key);
        // eslint-disable-next-line eqeqeq, no-eq-null
        return data != null;
    }

    /**
     * Deletes item from the database
     * @param {string} key The key
     * @returns {Promise<boolean>}
     */
    public async delete(key: string) {
        this.__readyCheck();
        const keyMetadata = Util.getKeyMetadata(key);
        if (!keyMetadata.target) {
            const removed = await this.model.deleteOne({
                ID: keyMetadata.master
            });

            return removed.deletedCount > 0;
        }

        const existing = await this.model.findOne({ ID: keyMetadata.master });
        if (!existing) return false;
        if (existing.data !== null && typeof existing.data !== "object") throw new Error("CANNOT_TARGET_NON_OBJECT");
        const prev = Object.assign({}, existing.data);
        _.unset(prev, keyMetadata.target);
        await existing.updateOne({
            $set: {
                data: prev
            }
        });
        return true;
    }

    /**
     * Delete all data from this database
     * @returns {Promise<boolean>}
     */
    public async deleteAll() {
        const res = await this.model.deleteMany();
        return res.deletedCount > 0;
    }

    /**
     * Get the document count in this database
     * @returns {Promise<number>}
     */
    public async count() {
        return await this.model.estimatedDocumentCount();
    }

    /**
     * The database latency in ms
     * @returns {number}
     */
    public async ping() {
        const initial = Date.now();
        await this.get("SOME_RANDOM_KEY");
        return Date.now() - initial;
    }

    /**
     * Create a child database, either from new connection or current connection (similar to quick.db table)
     * @param {?string} collection The collection name (defaults to `JSON`)
     * @param {?string} url The database url (not needed if the child needs to share connection from parent)
     * @returns {Promise<Database>}
     * @example const child = await db.instantiateChild("NewCollection");
     * console.log(child.all());
     */
    public async instantiateChild<K = unknown>(collection?: string, url?: string): Promise<Database<K>> {
        const childDb = new Database<K, T>(url || this.url, {
            ...this.options,
            child: true,
            parent: this,
            collectionName: collection,
            shareConnectionFromParent: !!url || true
        });

        const ndb = await childDb.connect();
        return ndb;
    }

    /**
     * Identical to quick.db table
     * @type {Database}
     * @example const table = new db.table("table");
     * table.set("foo", "Bar");
     */
    public get table() {
        return new Proxy(
            function () {
                /* noop */
            } as unknown as TableConstructor,
            {
                construct: (_, args) => {
                    const name = args[0];
                    if (!name || typeof name !== "string") throw new TypeError("ERR_TABLE_NAME");
                    const db = new Database(this.url, this.options);

                    db.connection = this.connection;
                    db.model = modelSchema(this.connection, name);
                    db.connect = () => Promise.resolve(db);

                    Object.defineProperty(db, "table", {
                        get() {
                            return;
                        },
                        set() {
                            return;
                        }
                    });

                    return db;
                },
                apply: () => {
                    throw new Error("TABLE_IS_NOT_A_FUNCTION");
                }
            }
        );
    }

    /**
     * Returns everything from the database
     * @param {?AllQueryOptions} options The request options
     * @returns {Promise<AllData>}
     */
    public async all(options?: AllQueryOptions) {
        this.__readyCheck();
        const everything = await this.model.find();
        let arb = everything
            .filter((x) => !(x.expireAt && x.expireAt.getTime() - Date.now() <= 0))
            .map((m) => ({
                ID: m.ID,
                data: this.__formatData(m)
            }))
            .filter((doc, idx) => {
                if (options?.filter) return options.filter(doc, idx);
                return true;
            }) as AllData<T>[];

        if (typeof options?.sort === "string") {
            if (options.sort.startsWith(".")) options.sort = options.sort.slice(1);
            const pref = options.sort.split(".");
            arb = _.sortBy(arb, pref).reverse();
        }

        return typeof options?.limit === "number" && options.limit > 0 ? arb.slice(0, options.limit) : arb;
    }

    /**
     * Drops this database
     * @returns {Promise<boolean>}
     */
    public async drop() {
        this.__readyCheck();
        return await this.model.collection.drop();
    }

    /**
     * Identical to quick.db push
     * @param {string} key The key
     * @param {any|any[]} value The value or array of values
     * @returns {Promise<any>}
     */
    public async push(key: string, value: unknown | unknown[]) {
        const data = await this.get(key);
        // eslint-disable-next-line eqeqeq, no-eq-null
        if (data == null) {
            if (!Array.isArray(value)) return await this.set(key, [value]);
            return await this.set(key, value);
        }
        if (!Array.isArray(data)) throw new Error("TARGET_EXPECTED_ARRAY");
        if (Array.isArray(value)) return await this.set(key, data.concat(value));
        data.push(value);
        return await this.set(key, data);
    }

    /**
     * similar to db.push() but removes the data if available instead 
     * @param {string} key The key
     * @param {any|any[]} value The value or array of values
     * @returns {Promise<any>}
     */
    public async push(key: string, value: unknown | unknown[]) {
        const data = await this.get(key);
        // eslint-disable-next-line eqeqeq, no-eq-null
        if (data == null) {
            // throw new Error("NO DATA TO REMOVE"); // Would suggest to just return null
            return null;
        }
        if (!Array.isArray(data)) throw new Error("TARGET_EXPECTED_ARRAY");
        // allow db.remove(key, d); and: db.remove(key, data => data.foo == "bar") 
        const FindFunction = _.isFunction(value) ? value : (v) => value === v;
        const DataIndex = data.findIndex(FindFunction);
        // If index found, remove it
        if (DataIndex > -1) {
          data.splice(DataIndex, 1);
        }
        return await this.set(key, data);
    }

    /**
     * Opposite of push, used to remove item
     * @param {string} key The key
     * @param {any|any[]} value The value or array of values
     * @returns {Promise<any>}
     */
    public async pull(key: string, value: unknown | unknown[], multiple = true): Promise<false | T> {
        let data = (await this.get(key)) as T[];
        // eslint-disable-next-line eqeqeq, no-eq-null
        if (data == null) return false;
        if (!Array.isArray(data)) throw new Error("TARGET_EXPECTED_ARRAY");
        if (Array.isArray(value)) {
            data = data.filter((i) => !value.includes(i));
            return await this.set(key, data);
        } else {
            if (multiple) {
                data = data.filter((i) => i !== value);
                return await this.set(key, data);
            } else {
                const hasItem = data.some((x) => x === value);
                if (!hasItem) return false;
                const index = data.findIndex((x) => x === value);
                data = data.splice(index, 1);
                return await this.set(key, data);
            }
        }
    }

    /**
     * Identical to quick.db add
     * @param {string} key The key
     * @param {number} value The value
     * @returns {any}
     */
    public async add(key: string, value: number) {
        if (typeof value !== "number") throw new TypeError("VALUE_MUST_BE_NUMBER");
        const val = await this.get(key);
        return await this.set(key, (typeof val === "number" ? val : 0) + value);
    }

    /**
     * Identical to quick.db subtract
     * @param {string} key The key
     * @param {number} value The value
     * @returns {any}
     */
    public async subtract(key: string, value: number) {
        if (typeof value !== "number") throw new TypeError("VALUE_MUST_BE_NUMBER");
        const val = await this.get(key);
        return await this.set(key, (typeof val === "number" ? val : 0) - value);
    }

    /**
     * Connects to the database.
     * @returns {Promise<Database>}
     */
    public connect() {
        return new Promise<Database<T>>((resolve, reject) => {
            if (typeof this.url !== "string" || !this.url) return reject(new Error("MISSING_MONGODB_URL"));

            this.__child__ = Boolean(this.options.child);
            this.parent = (this.options.parent as Database<PAR>) || null;
            const collectionName = this.options.collectionName;
            const shareConnectionFromParent = !!this.options.shareConnectionFromParent;

            delete this.options["collectionName"];
            delete this.options["child"];
            delete this.options["parent"];
            delete this.options["shareConnectionFromParent"];

            if (shareConnectionFromParent && this.__child__ && this.parent) {
                if (!this.parent.connection) return reject(new Error("PARENT_HAS_NO_CONNECTION"));
                this.connection = this.parent.connection;
                this.model = modelSchema<T>(this.connection, Util.v(collectionName, "string", "JSON"));
                return resolve(this);
            }

            mongoose.createConnection(this.url, this.options, (err, connection) => {
                if (err) return reject(err);
                this.connection = connection;
                this.model = modelSchema<T>(this.connection, Util.v(collectionName, "string", "JSON"));
                this.emit("ready", this);
                this.__applyEventsBinding();
                resolve(this);
            });
        });
    }

    /**
     * The db metadata
     * @type {?Object}
     */
    public get metadata() {
        if (!this.model) return null;
        return {
            name: this.model.collection.name,
            db: this.model.collection.dbName,
            namespace: this.model.collection.namespace
        };
    }

    /**
     * Returns database statistics
     * @returns {Promise<CollStats>}
     */
    public async stats() {
        this.__readyCheck();
        const stats = await this.model.collection.stats();
        return stats;
    }

    /**
     * Close the database connection
     * @param {?boolean} [force=false] Close forcefully
     * @returns {Promise<void>}
     */
    public async close(force = false) {
        return await this.connection.close(force);
    }

    private __applyEventsBinding() {
        this.__readyCheck();
        const events = ["connecting", "connected", "open", "disconnecting", "disconnected", "close", "reconnected", "error", "fullsetup", "all", "reconnectFailed", "reconnectTries"];

        for (const event of events) {
            this.connection.prependListener(event, (...args) => {
                // @ts-expect-error event forwarder
                this.emit(event, ...args);
            });
        }
    }

    /**
     * Formats document data
     * @param {Document} doc The document
     * @returns {any}
     * @private
     */
    private __formatData(doc: DocType<T>) {
        return doc?.data ? doc.data : null;
    }

    /**
     * Checks if the database is ready
     * @private
     */
    private __readyCheck() {
        if (!this.model) throw new Error("DATABASE_NOT_READY");
    }
}

export interface TableConstructor<V = unknown> {
    new (name: string): Database<V>;
}

/**
 * Emitted once the database is ready
 * @event Database#ready
 * @param {Database} db The database
 */

/**
 * Emitted when Mongoose starts making its initial connection to the MongoDB server
 * @event Database#connecting
 */

/**
 * Emitted when QuickMongo successfully makes its initial connection to the MongoDB server, or when QuickMongo reconnects after losing connectivity. May be emitted multiple times if QuickMongo loses connectivity.
 * @event Database#connected
 */

/**
 * Emitted after `'connected'` and onOpen is executed on all of this connection's models.
 * @event Database#open
 */

/**
 * Emitted when called `db.close()` to disconnect from MongoDB
 * @event Database#disconnecting
 */

/**
 * Emitted when QuickMongo lost connection to the MongoDB server. This event may be due to your code explicitly closing the connection, the database server crashing, or network connectivity issues.
 * @event Database#disconnected
 */

/**
 * Emitted after `db.close()` successfully closes the connection. If you call `db.close()`, you'll get both a `'disconnected'` event and a `'close'` event.
 * @event Database#close
 */

/**
 * Emitted if QuickMongo lost connectivity to MongoDB and successfully reconnected. QuickMongo attempts to automatically reconnect when it loses connection to the database.
 * @event Database#reconnected
 */

/**
 * Emitted if an error occurs on a connection, like a parseError due to malformed data or a payload larger than `16MB`.
 * @event Database#error
 * @param {Error} error The error
 */

/**
 * Emitted when you're connecting to a replica set and QuickMongo has successfully connected to the primary and at least one secondary.
 * @event Database#fullsetup
 */

/**
 * Emitted when you're connecting to a replica set and Mongoose has successfully connected to all servers specified in your connection string.
 * @event Database#all
 */

/**
 * Emitted when you're connected to a standalone server and Mongoose has run out of `reconnectTries`. The MongoDB driver will no longer attempt to reconnect after this event is emitted. This event will never be emitted if you're connected to a replica set.
 * @event Database#reconnectFailed
 */
