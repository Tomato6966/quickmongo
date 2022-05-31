const mongoose = require('mongoose');
const Tinyfy = require("tiny-typed-emitter");
const lodash = require("lodash");
const fs = require("fs");
const redis = require("redis");
const util = require("util");
const StandardSchema = new mongoose.Schema({
    ID: {
        type: mongoose.SchemaTypes.String,
        required: !0,
        unique: !0
    },
    data: {
        type: mongoose.SchemaTypes.Mixed,
        required: !1
    },
    expireAt: {
        type: mongoose.SchemaTypes.Date,
        required: !1,
        default: null
    }
}, {
    timestamps: !0
})

const UtilClass = class extends null {
    constructor() { }
    static v(t, e, n) {
        return typeof t === e && !!t ? t : n
    }
    static pick(t, e) {
        if (!t || typeof t != "object" || !e || typeof e != "string" || !e.includes(".")) return t;
        let n = UtilClass.getKeyMetadata(e);
        return lodash.get(Object.assign({}, t), n.target)
    }
    static getKey(t) {
        return t.split(".").shift()
    }
    static getKeyMetadata(t) {
        let [e, ...n] = t.split(".");
        return {
            master: e,
            child: n,
            target: n.join(".")
        }
    }
    static shouldExpire(t) {
        return !(typeof t != "number" || t > 1 / 0 || t <= 0 || Number.isNaN(t))
    }
    static createDuration(t) {
        return UtilClass.shouldExpire(t) ? new Date(Date.now() + t) : null
    }
    
    static checkObjectDeep(dd, data) {
        let changed = false;
        // Layer 1
        for (const [Okey_1, value_1] of Object.entries(data)) {
          if(!dd[Okey_1] && dd[Okey_1] === undefined) {
            dd[Okey_1] = value_1; changed = true;
          } else if(value_1 && typeof value_1 == "object") {
            // Layer 2
            for (const [Okey_2, value_2] of Object.entries(value_1)) {
              if(!dd[Okey_1][Okey_2] && dd[Okey_1][Okey_2] === undefined) {
                dd[Okey_1][Okey_2] = value_2; changed = true;
              } else if(value_2 && typeof value_2 == "object")  {
                // Layer 3
                for (const [Okey_3, value_3] of Object.entries(value_2)) {
                  if(!dd[Okey_1][Okey_2][Okey_3] && dd[Okey_1][Okey_2][Okey_3] === undefined) {
                    dd[Okey_1][Okey_2][Okey_3] = value_3; changed = true;
                  } else if(value_3 === "object") {
                    // Layer 4
                    for (const [Okey_4, value_4] of Object.entries(value_3)) {
                      if(!dd[Okey_1][Okey_2][Okey_3][Okey_4] && dd[Okey_1][Okey_2][Okey_3][Okey_4] === undefined) {
                        dd[Okey_1][Okey_2][Okey_3][Okey_4] = value_4; changed = true;
                      } else if(value_4 === "object") {
                        continue;
                      } else continue; 
                    }
                    // End of layer 4
                  } else continue; 
                }
                // End of layer 3
              } else continue;
            }
            // End of layer 2
          } else continue;
        }
        if(changed) return dd;
        else return false;
    }
};
const DatabaseClass = class extends Tinyfy.TypedEmitter {
    constructor(t, e = {}) {
        super();
        this.url = t;
        this.options = e;
        this.parent = null;
        this.__child__ = !1;
        this.model = null;
        this.cache = new Map();
        this.redisCache = false;
        this.pingkey = "SOMETHING_RANDOM_FOR_PING"
        
        this.keyForAll = `ALLDATABASE_${this.model?.collection?.name || "DB"}_ALLDATABASE`;

        this.timeoutcache = new Map(), 
        this.cacheTimeout = {
            ping: !isNaN(process.env.DB_cache_ping) ? Number(process.env.DB_cache_ping) : 60_000, // Delete the cache after X ms
            get: !isNaN(process.env.DB_cache_get) ? Number(process.env.DB_cache_get) : 300_000, // Delete the cache after X ms 
            all: !isNaN(process.env.DB_cache_all) ? Number(process.env.DB_cache_all) : 600_000, // Delete the cache after X ms
        }
        Object.defineProperty(this, "__child__", {
            writable: !0,
            enumerable: !1,
            configurable: !0
        })
    }

    // UTILS for the CACHE
    formatCache(data) {
        return this.redisCache ? JSON.stringify(data) : data
    }
    parseCache(data) {
        return this.redisCache ? JSON.parse(data) : data
    }
    // CACHE - USE REDIS
    async connectToRedis(RedisSettings) {
        return new Promise(async res => {
            // REDIS
            const redisClient = redis.createClient(RedisSettings);
    
            redisClient.on('error', (err) => console.log('Redis Client Error', err));
            redisClient.on('connect', () => console.log('Redis Client connected'));
            redisClient.on('ready', async () => {
                console.log('Redis Client ready')

                this.cache = redisClient;
                this.redisCache = true
                return res(redisClient);
            });
            redisClient.connect();
        })
    }

    isChild() {
        return !this.isParent()
    }
    isParent() {
        return !this.__child__
    }

    get ready() {
        return !!(this.model && this.connection)
    }
    get readyState() {
        return this.connection?.readyState ?? 0
    }

    // Fetch from MONGODB
    async getRaw(key) {
        return new Promise(async (res) => {
            this.__readyCheck();
            let e = await this.model.findOne({
                ID: UtilClass.getKey(key)
            });
            return res(!e || e.expireAt && e.expireAt.getTime() - Date.now() <= 0 ? null : e)
        })
    }

    // CACHE + FETCH FROM MONGODB
    async get(key, forceFetch = false) {
        let t_Ping = Date.now();
        const Master = UtilClass.getKey(key);
        const cacheValue = await this.cache.get(Master);
        
        if (cacheValue && !forceFetch && this.cacheTimeout.get > -1 && (this.cacheTimeout.get == 0 || this.cacheTimeout.get - (Date.now() - this.timeoutcache.get(Master)) > 0)) {
            const RawData = this.parseCache(cacheValue)
            if(!RawData || RawData === null) {
                console.error("GET DB KEY NOT EXISTING IN CACHE")
                return RawData
            }
            // Return the picked Data
            return UtilClass.pick(RawData, key);
        } else {
            const RawData = await this.getRaw(Master)

            if(RawData === null || !this.__formatData(RawData)) {
                console.error("GET DB KEY NOT EXISTING")
                return this.__formatData(RawData)
            }
            
            // Update the PING
            const ping = Date.now() - t_Ping;
            await this.cache.set(this.pingkey, this.formatCache(ping));
            this.timeoutcache.set(this.pingkey, Date.now()); 

            // Return the picked Data
            return await this.updateCache(Master, this.__formatData(RawData)), UtilClass.pick(this.__formatData(RawData), key);
        }
    }

    // fetch from the DB (alias of get method, but with forcefetch enabled on default)
    async fetch(key, forceFetch = true) {
        return await this.get(key, forceFetch)
    }
    
    // Update the Cache 
    async updateCache(key, data, allDatabaseUpdate = false) {
        if(key.includes(".")) {
            console.error("updateCache :: provided key with '.'");
        } else {
            if(!allDatabaseUpdate) {
                // Update the TOTAL DATABASE
                const allCachedDB = await this.cache.get(this.keyForAll); 
                if(allCachedDB) {
                    // lodash.set(Data, r.target, e)
                    const parsedData = this.parseCache(allCachedDB);
                    if(typeof parsedData == "object" && Array.isArray(parsedData)) {
                        const allDataPath = { ID: key, data: data };
                        const specificData = parsedData.find(d => d.ID == key);
                        const specificIndex = parsedData.findIndex(d => d.ID == key);
                        if(specificData && specificIndex > -1) {
                            parsedData[Number(specificIndex)] = allDataPath
                        } else {
                            parsedData.push(allDataPath);
                        }
                    }
                    await this.cache.set(this.keyForAll, this.formatCache(parsedData)); 
                }
                // Update the sub key caches
                await this.cache.set(key, this.formatCache(data));
                this.timeoutcache.set(key, Date.now()); 
                return true;
            } else {
                await this.cache.set(key, this.formatCache(data));
                this.timeoutcache.set(key, Date.now()); 
                if(typeof data != "object" && !Array.isArray(data)) return console.error("ALL DATA but not an ARRAY?");
                
                // Set cache of all subvalues
                for(const d of data) {
                    await this.cache.set(`${d.ID}`, this.formatCache(d.data))
                    this.timeoutcache.set(`${d.ID}`, Date.now()); 
                    continue;
                }
                return true;
            }
        }
        return true;
    }

    // Change the DB and the CACHE 
    async set(t, e, n = -1) {
        // if it's in the cache delete it, so that it can get updated on the next .get()
        if (this.__readyCheck() && t.includes(".")) {
            const r = UtilClass.getKeyMetadata(t);
            const o = await this.model.findOne({
                ID: r.master
            })
            // if it is not existing, create a new modl and return
            if (!o) {
                const setData = lodash.set({}, r.target, e);
                await this.model.create(UtilClass.shouldExpire(n) ? {
                    ID: r.master,
                    data: setData,
                    expireAt: UtilClass.createDuration(n * 1e3)
                } : {
                    ID: r.master,
                    data: setData
                }).catch(err => {
                    console.error(this.model.collection.name);
                    console.error(err);
                });

                return await this.updateCache(r.master, setData), await this.get(t);
            }
            // if no correct data, return error
            if (o.data !== null && typeof o.data != "object") throw new Error("CANNOT_TARGET_NON_OBJECT");
            const l = Object.assign({}, o.data);
            const s = lodash.set(l, r.target, e);
            // update the class and return it eventually
            await o.updateOne({
                $set: UtilClass.shouldExpire(n) ? {
                    data: s,
                    expireAt: UtilClass.createDuration(n * 1e3)
                } : {
                    data: s
                }
            }).catch(err => {
                console.error(this.model.collection.name);
                console.error(err);
            });
            
            // r = Util.getKeyMetadata("123.abc.ABC") = { master: '123', child: [ 'abc', 'ABC' ], target: 'abc.ABC' }
            
            return await this.updateCache(r.master, s), await this.get(t)
        } 
        // if its a non object based key
        else {
            await this.model.findOneAndUpdate({
                ID: t
            }, {
                $set: UtilClass.shouldExpire(n) ? {
                    data: e,
                    expireAt: UtilClass.createDuration(n * 1e3)
                } : {
                    data: e
                }
            }, {
                upsert: !0
            }).catch(err => {
                console.error(this.model.collection.name);
                console.error(err);
            });
            
            return await this.updateCache(t, e), await this.get(t)
        }
    }

    // Check if there is data in the db
    async has(key, forceFetch = false) {
        return await this.get(key, forceFetch) != null
    }

    // Make sure that there is specific data in the db (works with key and key.subkey.subsubkey....)
    async ensure(key, defaultObject) {
        this.__readyCheck();
        if(_.isNil(defaultObject)) {
            throw new Error(`No default value for for "${key}"`)
        }
        
        const newData = lodash.clone(defaultObject);
        const r = UtilClass.getKeyMetadata(key);

        // get the current master data if 
        const dbData = await this.get(r.master) || {};
        // if there is a target, check for the target
        if(r.target) {
            if(lodash.has(dbData, r.target)) {
                const pathData = lodash.get(newData, r.target)
                const newPathData = UtilClass.checkObjectDeep(pathData, data);
                // something has changed
                if(newPathData) {
                    lodash.set(newData, path, newPathData);
                    await db.set(r.master, newData);
                    return res({ changed: true });
                }
                return res({ changed: false }); 
            }
            // if it's not in the dbData, then set it
            lodash.set(dbData, r.target, newData)
            await db.set(r.master, dbData);
            return res({ changed: true });
        }
        // check for non-targets object changes
        const newPathData = UtilClass.checkObjectDeep(newData, data);
        // something has changed
        if(newPathData) {
            Object.assign(newData, newPathData);
            await db.set(r.master, newData);
            return res({ changed: true });
        } 
        // return something
        return res({ changed: false }); 
    }
    
    // Delete properties from the Object and from the Cache
    async delete(t) {
        this.__readyCheck();
        let Key = UtilClass.getKeyMetadata(t);

        if (!Key.target) {
            // remove from the CACHE
            this.redisCache ? await this.cache.sendCommand(['DEL', Key.master]) : this.cache.delete(Key.master)

            // remove from the DB
            return (await this.model.deleteOne({
                ID: Key.master
            })).deletedCount > 0;
        }
        let Document = await this.model.findOne({
            ID: Key.master
        })
        if (!Document) return !1;
        if (Document.data !== null && typeof Document.data != "object") throw new Error("CANNOT_TARGET_NON_OBJECT");
        // Create an object
        let formattedData = Object.assign({}, Document.data);
        // remove the target from the object
        lodash.unset(formattedData, Key.target);
        // Save the new Cache (just a key of the object got removed that's why)
        this.redisCache ? await this.cache.set(Key.master, formattedData) : this.cache.set(Key.master);
        // Update the DB with the removed object
        await Document.updateOne({
            $set: {
                data: formattedData
            }
        }).catch(err => {
            console.error(this.model.collection.name);
            console.error(err);
        });

        return !0
    }

    // deleteAll Docs in the mongodb
    async deleteAll() {
        // Clear the cache
        this.redisCache ? await this.cache.sendCommand(['FLUSHALL']) : this.cache.clear();
        // Clear the DB
        const deleted = await this.model.deleteMany();
        // Show value
        return deleted?.deletedCount > 0
    }

    // Mongodb Collection Size [Default is forceFetching aka not getting from cache]
    async count(forceFetch = true) {
        if(forceFetch) return await this.model.estimatedDocumentCount()

        const cacheValue = await this.cache.get(this.keyForAll);
        if(cacheValue) {
            return this.parseCache(cacheValue).length;
        }
        
        return await this.model.estimatedDocumentCount()
    }

    // ping the db by fetching data + save it in the cache
    async ping(forceFetch = false) {
        const t_Ping = Date.now();
        const cacheValue = await this.cache.get(this.pingkey);
        
        if (cacheValue && !forceFetch && this.cacheTimeout.ping > -1 && (this.cacheTimeout.ping == 0 || this.cacheTimeout.ping - (Date.now() - this.timeoutcache.get(this.pingkey)) > 0)) {
            return this.parseCache(cacheValue)
        } else {
            await this.get(this.pingkey, true)
            const ping = Date.now() - t_Ping;
            await this.cache.set(this.pingkey, this.formatCache(ping));
            this.timeoutcache.set(this.pingkey, Date.now()); 
            return ping;
        }
    }

    // create a child instance with the same options
    async instantiateChild(t, e) {
        return await new d(e || this.url, {
            ...this.options,
            child: !0,
            parent: this,
            cache: this.redisCache ? this.cache : new Map(),
            redisCache: this.redisCache,
            keyForAll: `ALLDATABASE_${t || "DB"}_ALLDATABASE`,
            collectionName: t,
            shareConnectionFromParent: !!e || !0
        }).connect()
    }

    // Create a table aka Collection
    get table() {
        return new Proxy(function () { }, {
            construct: (t, e) => {
                let n = e[0];
                if (!n || typeof n != "string") throw new TypeError("ERR_TABLE_NAME");
                let r = new DatabaseClass(this.url, this.options, this.cacheTimeout);
                if(this.redisCache) {
                    r.redisCache = this.redisCache;
                    r.cache = this.cache;
                }
                r.connection = this.connection;
                r.model = Indexer(this.connection, n);
                r.keyForAll = `ALLDATABASE_${r.model?.collection?.name || "DB"}_ALLDATABASE`
                
                return r.connect = () => Promise.resolve(r), Object.defineProperty(r, "table", {
                    get() { },
                    set() { }
                }), r;
            },
            apply: () => {
                throw new Error("TABLE_IS_NOT_A_FUNCTION")
            }
        })
    }

    // Fetch complete Mongodb + Set the Cache
    async all(t, forceFetch = false) {
        this.__readyCheck();
        
        // await this.cache.set(keyForAll, JSON.stringify(false));
        const cacheValue = await this.cache.get(this.keyForAll);
        if (cacheValue && !forceFetch && this.cacheTimeout.all > -1 && (this.cacheTimeout.all == 0 || this.cacheTimeout.all - (Date.now() - this.timeoutcache.get(this.keyForAll)) > 0)) {
            const CacheResult = this.parseCache(cacheValue);
            return typeof t?.limit == "number" && t.limit > 0 ? CacheResult.slice(0, t.limit) : CacheResult;
        } else {
            let n = (await this.model.find().lean()).filter(r => !(r.expireAt && r.expireAt.getTime() - Date.now() <= 0)).map(r => ({
                ID: r.ID,
                data: this.__formatData(r)
            })).filter((r, o) => t?.filter ? t.filter(r, o) : !0);
            
            if (typeof t?.sort == "string") {
                t.sort.startsWith(".") && (t.sort = t.sort.slice(1));
                let r = t.sort.split(".");
                n = lodash.sortBy(n, r).reverse()
            }
            return await this.updateCache(this.keyForAll, n, true), typeof t?.limit == "number" && t.limit > 0 ? n.slice(0, t.limit) : n;
        }
        
    }

    async drop() {
        return this.__readyCheck(), await this.model.collection.drop()
    }

    async push(t, e, forceFetch = true) {
        let n = await this.get(t, forceFetch);
        if (n == null) return Array.isArray(e) ? await this.set(t, e) : await this.set(t, [e]);
        if (!Array.isArray(n)) throw new Error("TARGET_EXPECTED_ARRAY");
        return Array.isArray(e) ? await this.set(t, n.concat(e)) : (n.push(e), await this.set(t, n)) 
    }
    async pull(t, e, n = !0) {
        let r = await this.get(t);
        if (r == null) return !1;
        if (!Array.isArray(r)) throw new Error("TARGET_EXPECTED_ARRAY");
        if (Array.isArray(e)) return r = r.filter(o => !e.includes(o)), await this.set(t, r);
        if (n) return r = r.filter(o => o !== e), await this.set(t, r); {
            if (!r.some(s => s === e)) return !1;
            let l = r.findIndex(s => s === e);
            return r = r.splice(l, 1), await this.set(t, r)
        }
    }
    async add(t, e) {
        if (typeof e != "number") throw new TypeError("VALUE_MUST_BE_NUMBER");
        let n = await this.get(t);
        return await this.set(t, (typeof n == "number" ? n : 0) + e)
    }
    async subtract(t, e) {
        if (typeof e != "number") throw new TypeError("VALUE_MUST_BE_NUMBER");
        let n = await this.get(t);
        return await this.set(t, (typeof n == "number" ? n : 0) - e)
    }

    connect() {
        return new Promise((t, e) => {
            if (typeof this.url != "string" || !this.url) return e(new Error("MISSING_MONGODB_URL"));
            this.__child__ = Boolean(this.options.child), this.parent = this.options.parent || null;
            let n = this.options.collectionName,
                r = !!this.options.shareConnectionFromParent;
            if (delete this.options.collectionName, delete this.options.child, delete this.options.parent, delete this.options.shareConnectionFromParent, r && this.__child__ && this.parent) return this.parent.connection ? (this.connection = this.parent.connection, this.model = Indexer(this.connection, UtilClass.v(n, "string", "JSON")), 
            t(this)) : e(new Error("PARENT_HAS_NO_CONNECTION"));
            mongoose.createConnection(this.url, this.options, async (o, l) => {
                if (o) return e(o);
                this.connection = l, 
                this.model = Indexer(this.connection, UtilClass.v(n, "string", "JSON")), 
                this.emit("ready", this), this.__applyEventsBinding(), 
                t(this);
            })
        })
    }

    get metadata() {
        return this.model ? {
            name: this.model.collection.name,
            db: this.model.collection.dbName,
            namespace: this.model.collection.namespace
        } : null
    }

    async stats() {
        return this.__readyCheck(), await this.model.collection.stats()
    }

    async close(t = !1) {
        return await this.connection.close(t)
    }

    __applyEventsBinding() {
        this.__readyCheck();
        let t = ["connecting", "connected", "open", "disconnecting", "disconnected", "close", "reconnected", "error", "fullsetup", "all", "reconnectFailed", "reconnectTries"];
        for (let e of t) this.connection.prependListener(e, (...n) => {
            this.emit(e, ...n)
        })
    }

    __formatData(t) {
        if(t && t.data) return t.data
        else return null;
        
    }

    __readyCheck() {
        if (!this.model) throw new Error("DATABASE_NOT_READY")
        else return true;
    }
};


function Indexer(i, t = "JSON") {
    let e = i.model(t, StandardSchema);

    e.collection.createIndex({
        expireAt: 1
    }, {
        expireAfterSeconds: 0
    }).catch(() => null)
    
    return e
}
function Define (i){ 
    return Object.defineProperty(i, "__esModule", { value: !0 });
}
function IterateCreation (i, t) {
    for (const e in t) 
        Object.defineProperty(i, e, {
            get: t[e],
            enumerable: !0
        })
    return true;
};
function ChangeG (i, t, e, n) {
    if (t && typeof t == "object" || typeof t == "function")
        for (let r of Object.getOwnPropertyNames(t)) !Object.prototype.hasOwnProperty.call(i, r) && (e || r !== "default") && Object.defineProperty(i, r, {
            get: () => t[r],
            enumerable: !(n = Object.getOwnPropertyDescriptor(t, r)) || n.enumerable
        });
    return i
};

const ExportFormat = (i => (t, e) => i && i.get(t) || (e = ChangeG(Define({}), t, 1), i && i.set(t, e), e))(typeof WeakMap != "undefined" ? new WeakMap : 0);
const I = {};
IterateCreation(I, {
    Database: () => DatabaseClass,
    Util: () => UtilClass,
    docSchema: () => StandardSchema
});

module.exports = ExportFormat(I);
0 && (module.exports = {
    Database,
    Util,
    docSchema
});
