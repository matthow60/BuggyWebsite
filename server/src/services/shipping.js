// Delivery estimates by ZIP code. We only ship within Texas (ZIP prefixes 750–799).

const DAY_MS = 24 * 60 * 60 * 1000;

// ZIP prefix -> business days in transit from the Arlington warehouse.
const TRANSIT_DAYS = {};
for (let prefix = 750; prefix <= 799; prefix++) {
  TRANSIT_DAYS[String(prefix)] = prefix <= 762 ? 2 : 4; // DFW metroplex ships faster
}
TRANSIT_DAYS['760'] = 1; // Arlington

function estimateDelivery(zip, now = new Date()) {
  const clean = String(zip || '').trim();
  const days = /^\d{5}$/.test(clean) ? TRANSIT_DAYS[clean.slice(0, 3)] : undefined;
  const arrives = days !== undefined ? new Date(now.getTime() + days * DAY_MS) : null;

  return {
    zip: clean,
    days,
    arrivesOn: arrives ? arrives.toISOString().slice(0, 10) : null,
  };
}

module.exports = { estimateDelivery };
