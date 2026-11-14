// One shared MongoClient for crash reporting (created on first use, then reused).
const { MongoClient } = require('mongodb');
const config = require('./config');

let client = null;
let ready = null;

function connect() {
  if (!config.mongoUri) {
    return Promise.reject(new Error('CRASH_REPORT_MONGODB_URI is not set'));
  }
  if (!ready) {
    client = new MongoClient(config.mongoUri, {
      appName: 'buggywebsite-crash-report',
      serverSelectionTimeoutMS: 5000,
    });
    ready = client
      .connect()
      .then(() => client.db(config.dbName))
      .catch((err) => {
        ready = null; // let the next crash try again
        throw err;
      });
  }
  return ready;
}

async function collections() {
  const db = await connect();
  return { incidents: db.collection(config.incidentsCollection) };
}

async function close() {
  if (client) await client.close();
  client = null;
  ready = null;
}

module.exports = { connect, collections, close };
