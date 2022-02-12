# QuickMongo

Quick Mongodb wrapper for beginners that provides key-value based interface.

> Added an IN MEMORY CACHE by using `this.cache = new Map()`;
> You can't access them, and **just use it as `quickmongo`**
> The File handles all of the caching by itsself! (also resetting the cache if something changes in the db.........
> *Fastens it up by ~90-125% (if you do many .set() requests == POST)*
> *Fastens it up by over 300% (if you do many .get() requests == GET)*

**Why is this good?**
> You do not spam mongodb, and it's userfriendly, you don't need something like `redis` or `cache-manager`
> NOTE: It's the simplest way of caching, and only applies if u got the request ONCE, so it's not "that efficient" but good enough if u plan on running ur app/programm for several hours!

to install it: `npm install https://github.com/Tomato6966/quickmongo`

## EXTRAS ADDED:

> Getting things out of the cache will work until the max. cache duration is reached

```js
// How to change them
// change the max. cache duration for db.ping()
process.env.DB_cache_ping = 10_000; // Delete the cache after X ms | < 0 === never delete [DEFAULT: 60_000], -1 (or less) == disabled cache
// change the max. cache duration for db.get("key", [optional: ForceFetch <true/false>])
process.env.DB_cache_get = 0; // Delete the cache after X ms | 0 === never delete [DEFAULT: 300_000], -1 (or less) == disabled cache
// change the max. cache duration for db.all([optional: ForceFetch <true/false>])
process.env.DB_cache_all = 0; // Delete the cache after X ms | 0 === never delete [DEFAULT: 600_000], -1 (or less) == disabled cache
```

```js

const { Database } = require("quickmongo"); // npm i https://github.com/Tomato6966/quickmongo
const mongoUri = process.env.mongoUri;
const db = new Database(mongoUri);

// CHANGES FOR THE .get() method
db.get("key"); // 1. Time getting --> Fetch from db
db.get("key"); // 2. Time getting --> Get from cache (instant) 
db.get("key", true) // 3. Time getting --> Force-fetch from db (you can add ,true for fetching)

// CHANGES FOR THE .ping() METHOD
db.ping(); // 1. Time getting --> PING THE db
db.ping(); // 2. Time getting --> Get the last ping, which u got before (instant) ( will work until the max. cache duration is reached )
db.ping(true) // 3. Time getting --> Force-fetch from db (you can add ,true for fetching)

// CHANGES FOR THE .all() METHOD
db.all(); // 1. Time getting --> Fetch from the db
db.all(); // 2. Time getting --> Get it from the cache (intsant)
db.all(true) // 3. Time getting --> Force-fetch from db (you can add , true for fetching)

```

## Suggestions:

When creating the Database, add mongoose options, to spread the load on your db!

```js
const { Database } = require("quickmongo"); // npm i https://github.com/Tomato6966/quickmongo
const mongoUri = process.env.mongoUri;
const db = new Database(mongoUri, {
    useUnifiedTopology: true, // allow pools
    maxPoolSize: 100, // maximum spreader
    minPoolSize: 50, // minimum spreader
    writeConcern: "majority", // writer before get
});

```
## Tests:

If you're interested to see it changes test this:

```js
const { Database } = require("quickmongo"); // npm i https://github.com/Tomato6966/quickmongo
const mongoUri = process.env.mongoUri;

process.env.DB_cache_ping = 10_000; // allow the cache to be just 10 sec in there...

const db = new Database(mongoUri, {
    useUnifiedTopology: true, // allow pools
    maxPoolSize: 100, // maximum spreader
    minPoolSize: 50, // minimum spreader
    writeConcern: "majority", // writer before get
});
// first time
setTimeout(async() => console.log(`Ping: ${await db.ping()}`), 1_000) // fetch from the db (DIRECT VALUE FROM MONGODB)
// 2 times from cache (will be instant when the timeout executes)
setTimeout(async() => console.log(`Ping: ${await db.ping()}`), 5_000) // cache
setTimeout(async() => console.log(`Ping: ${await db.ping()}`), 8_000) // cache
// cache ranned out, after first fetch, so fetch it again ( you cahgned process.env.DB_cache_ping to 10secs)
setTimeout(async() =>console.log(`Ping: ${await db.ping()}`), 11_000) // fetch (DIRECT VALUE FROM MONGODB)
// get it from the cache again as it's already in there
setTimeout(async() => console.log(`Ping: ${await db.ping()}`), 12_000) // get from cache
// force-fetch from the DB (DIRECT VALUE FROM MONGODB)
setTimeout(async() => console.log(`Ping: ${await db.ping(true)}`), 12_000) 
```

![](https://camo.githubusercontent.com/ee0b303561b8c04223d4f469633e2088968cf514f0f6901c729331c462a32f10/68747470733a2f2f63646e2e646973636f72646170702e636f6d2f6174746163686d656e74732f3739333638393539323431343939343436362f3833323039343438363834353834393631302f6c6f676f2e37393539646231325f35302e706e67)

# Installing

```bash
npm install --save https://github.com/Tomato6966/quickmongo # for the adjusted one with cache
npm install --save quickmongo # for the original without cache
```

# Documentation
**[https://quickmongo.js.org](https://quickmongo.js.org)**

# Features
- Beginner friendly
- Asynchronous
- Dot notation support
- Key-Value like interface
- Easy to use
- TTL (temporary storage) supported

# Example

```js
import { Database } from "quickmongo";

const db = new Database("mongodb://localhost:27017/quickmongo");

db.on("ready", () => {
    console.log("Connected to the database");
    doStuff();
});

// top-level awaits
await db.connect(); 

async function doStuff() {
    // Setting an object in the database:
    await db.set("userInfo", { difficulty: "Easy" });
    // -> { difficulty: 'Easy' }

    // Pushing an element to an array (that doesn't exist yet) in an object:
    await db.push("userInfo.items", "Sword");
    // -> { difficulty: 'Easy', items: ['Sword'] }

    // Adding to a number (that doesn't exist yet) in an object:
    await db.add("userInfo.balance", 500);
    // -> { difficulty: 'Easy', items: ['Sword'], balance: 500 }

    // Repeating previous examples:
    await db.push("userInfo.items", "Watch");
    // -> { difficulty: 'Easy', items: ['Sword', 'Watch'], balance: 500 }
    await db.add("userInfo.balance", 500);
    // -> { difficulty: 'Easy', items: ['Sword', 'Watch'], balance: 1000 }

    // Fetching individual properties
    await db.get("userInfo.balance"); // -> 1000
    await db.get("userInfo.items"); // -> ['Sword', 'Watch']

    // remove item
    await db.pull("userInfo.items", "Sword");
    // -> { difficulty: 'Easy', items: ['Watch'], balance: 1000 }

    // set the data and automatically delete it after 1 minute
    await db.set("foo", "bar", 60); // 60 seconds = 1 minute

    // fetch the temporary data after a minute
    setTimeout(async () => {
        await db.get("foo"); // null
    }, 60_000);
}
```

**Created and maintained by CesiumLabs**

# Discord Support
**[CesiumLabs](https://discord.gg/uqB8kxh)**
