import mongoose, { NativeError } from 'mongoose';
import * as mongodb from 'mongodb';
import { TypedEmitter } from 'tiny-typed-emitter';

interface CollectionInterface<T = unknown> {
    ID: string;
    data: T;
    createdAt: Date;
    updatedAt: Date;
    expireAt?: Date;
}
declare const docSchema: mongoose.Schema<CollectionInterface<unknown>, mongoose.Model<CollectionInterface<unknown>, any, any, any>, {}>;

/**
 * This object also accepts mongodb options
 * @typedef {Object} QuickMongoOptions
 * @property {?string} [collectionName="JSON"] The collection name
 * @property {?boolean} [child=false] Instantiate as a child
 * @property {?Database} [parent=false] Parent db
 * @property {?boolean} [shareConnectionFromParent=false] Share db connection
 */
interface QuickMongoOptions extends mongoose.ConnectOptions {
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
interface AllQueryOptions<T = unknown> {
    limit?: number;
    sort?: string;
    filter?: (data: AllData<T>, idx: number) => boolean;
}
/**
 * @typedef {Object} AllData
 * @property {string} ID The id/key
 * @property {any} data The data
 */
interface AllData<T = unknown> {
    ID: string;
    data: T;
}
/**
 * Document Type, mongoose document
 * @typedef {Object} DocType
 */
declare type DocType<T = unknown> = mongoose.Document<any, any, CollectionInterface<T>> & CollectionInterface<T> & {
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
declare class Database<T = unknown, PAR = unknown> extends TypedEmitter<QmEvents<T>> {
    url: string;
    options: QuickMongoOptions;
    connection: mongoose.Connection;
    parent: Database<PAR>;
    private __child__;
    model: mongoose.Model<CollectionInterface<T>, {}, {}, {}>;
    /**
     * Creates new quickmongo instance
     * @param {string} url The database url
     * @param {QuickMongoOptions} [options={}] The database options
     */
    constructor(url: string, options?: QuickMongoOptions);
    /**
     * If this is a child database
     * @returns {boolean}
     */
    isChild(): boolean;
    /**
     * If this is a parent database
     * @returns {boolean}
     */
    isParent(): boolean;
    /**
     * If the database is ready
     * @type {boolean}
     */
    get ready(): boolean;
    /**
     * Database ready state
     * @type {number}
     */
    get readyState(): number;
    /**
     * Get raw document
     * @param {string} key The key
     * @returns {Promise<DocType>}
     * @private
     */
    getRaw(key: string): Promise<DocType<T>>;
    /**
     * Get item from the database
     * @param {string} key The key
     * @returns {Promise<any>}
     */
    get<V = T>(key: string): Promise<V>;
    /**
     * Get item from the database
     * @param {string} key The key
     * @returns {Promise<any>}
     */
    fetch<V = T>(key: string): Promise<V>;
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
    set(key: string, value: T | unknown, expireAfterSeconds?: number): Promise<T>;
    /**
     * Returns false if the value is nullish, else true
     * @param {string} key The key
     * @returns {Promise<boolean>}
     */
    has(key: string): Promise<boolean>;
    /**
     * Deletes item from the database
     * @param {string} key The key
     * @returns {Promise<boolean>}
     */
    delete(key: string): Promise<boolean>;
    /**
     * Delete all data from this database
     * @returns {Promise<boolean>}
     */
    deleteAll(): Promise<boolean>;
    /**
     * Get the document count in this database
     * @returns {Promise<number>}
     */
    count(): Promise<number>;
    /**
     * The database latency in ms
     * @returns {number}
     */
    ping(): Promise<number>;
    /**
     * Create a child database, either from new connection or current connection (similar to quick.db table)
     * @param {?string} collection The collection name (defaults to `JSON`)
     * @param {?string} url The database url (not needed if the child needs to share connection from parent)
     * @returns {Promise<Database>}
     * @example const child = await db.instantiateChild("NewCollection");
     * console.log(child.all());
     */
    instantiateChild<K = unknown>(collection?: string, url?: string): Promise<Database<K>>;
    /**
     * Identical to quick.db table
     * @type {Database}
     * @example const table = new db.table("table");
     * table.set("foo", "Bar");
     */
    get table(): TableConstructor<unknown>;
    /**
     * Returns everything from the database
     * @param {?AllQueryOptions} options The request options
     * @returns {Promise<AllData>}
     */
    all(options?: AllQueryOptions): Promise<AllData<T>[]>;
    /**
     * Drops this database
     * @returns {Promise<boolean>}
     */
    drop(): Promise<boolean>;
    /**
     * Identical to quick.db push
     * @param {string} key The key
     * @param {any|any[]} value The value or array of values
     * @returns {Promise<any>}
     */
    push(key: string, value: unknown | unknown[]): Promise<T>;
    /**
     * Opposite of push, used to remove item
     * @param {string} key The key
     * @param {any|any[]} value The value or array of values
     * @returns {Promise<any>}
     */
    pull(key: string, value: unknown | unknown[], multiple?: boolean): Promise<false | T>;
    /**
     * Identical to quick.db add
     * @param {string} key The key
     * @param {number} value The value
     * @returns {any}
     */
    add(key: string, value: number): Promise<T>;
    /**
     * Identical to quick.db subtract
     * @param {string} key The key
     * @param {number} value The value
     * @returns {any}
     */
    subtract(key: string, value: number): Promise<T>;
    /**
     * Connects to the database.
     * @returns {Promise<Database>}
     */
    connect(): Promise<Database<T, unknown>>;
    /**
     * The db metadata
     * @type {?Object}
     */
    get metadata(): {
        name: string;
        db: string;
        namespace: string;
    };
    /**
     * Returns database statistics
     * @returns {Promise<CollStats>}
     */
    stats(): Promise<mongodb.CollStats>;
    /**
     * Close the database connection
     * @param {?boolean} [force=false] Close forcefully
     * @returns {Promise<void>}
     */
    close(force?: boolean): Promise<void>;
    private __applyEventsBinding;
    /**
     * Formats document data
     * @param {Document} doc The document
     * @returns {any}
     * @private
     */
    private __formatData;
    /**
     * Checks if the database is ready
     * @private
     */
    private __readyCheck;
}
interface TableConstructor<V = unknown> {
    new (name: string): Database<V>;
}

/**
 * The util class
 * @extends {null}
 */
declare class Util extends null {
    /**
     * This is a static class, do not instantiate
     */
    private constructor();
    /**
     * Validate
     * @param {any} k The source
     * @param {string} type The type
     * @param {?any} fallback The fallback value
     * @returns {any}
     */
    static v(k: any, type: string, fallback?: any): any;
    /**
     * Picks from nested object by dot notation
     * @param {any} holder The source
     * @param {?string} id The prop to get
     * @returns {any}
     */
    static pick(holder: any, id?: string): any;
    /**
     * Returns master key
     * @param {string} key The key that may have dot notation
     * @returns {string}
     */
    static getKey(key: string): string;
    /**
     * Returns key metadata
     * @param {string} key The key
     * @returns {KeyMetadata}
     */
    static getKeyMetadata(key: string): {
        master: string;
        child: string[];
        target: string;
    };
    /**
     * Utility to validate duration
     * @param {number} dur The duration
     * @returns {boolean}
     */
    static shouldExpire(dur: number): boolean;
    static createDuration(dur: number): Date;
}

export { AllData, AllQueryOptions, CollectionInterface, Database, DocType, QuickMongoOptions, TableConstructor, Util, docSchema };
