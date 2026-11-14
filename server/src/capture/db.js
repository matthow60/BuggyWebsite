// Lazy MongoDB connection shared by the crash catcher and the scripts.
const { MongoClient } = require('mongodb');
const config = require('./config');

let client = null;
let ready = null;

function connect() {
  if (!config.mongoUri) {
    return Promise.reject(new Error('MONGODB_URI is not set'));
  }
  if (!ready) {
    client = new MongoClient(config.mongoUri, {
      appName: 'mavs-merch-capture',
      serverSelectionTimeoutMS: 5000,
      ignoreUndefined: true,
    });
    ready = client
      .connect()
      .then(async () => {
        const db = client.db(config.dbName);
        // Default index names on purpose: the patcher creates { incidentId: 1 } unique too,
        // and a different name for the same index would make one of us fail.
        await db
          .collection(config.incidentsCollection)
          .createIndexes([{ key: { incidentId: 1 }, unique: true }, { key: { fingerprint: 1, status: 1 } }, { key: { createdAt: -1 } }])
          .catch((e) => console.warn('[capture] could not create indexes (continuing):', e.message));
        return db;
      })
      .catch((err) => {
        ready = null; // let the next crash try again
        throw err;
      });
  }
  return ready;
}

async function collections() {
  const db = await connect();
  return {
    incidents: db.collection(config.incidentsCollection),
    counters: db.collection('counters'),
  };
}

async function close() {
  if (client) await client.close();
  client = null;
  ready = null;
}

module.exports = { connect, collections, close };
