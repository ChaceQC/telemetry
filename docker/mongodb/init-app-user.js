const database = process.env.MONGODB_DATABASE || process.env.MONGO_INITDB_DATABASE || "telemetry";
const username = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;

if (!username || !password) {
  throw new Error("MONGODB_USER and MONGODB_PASSWORD are required to initialize the app user.");
}

const appDb = db.getSiblingDB(database);

if (appDb.getUser(username) === null) {
  appDb.createUser({
    user: username,
    pwd: password,
    roles: [{ role: "readWrite", db: database }],
  });
}

if (!appDb.getCollectionNames().includes("events")) {
  appDb.createCollection("events");
}

const events = appDb.getCollection("events");

events.createIndex(
  { project_id: 1, occurred_at: -1 },
  { name: "idx_events_project_occurred_at" }
);
events.createIndex(
  { project_id: 1, environment_id: 1, service_id: 1, occurred_at: -1 },
  { name: "idx_events_project_env_service_time" }
);
events.createIndex(
  { event_type: 1, occurred_at: -1 },
  { name: "idx_events_type_occurred_at" }
);
events.createIndex(
  { expires_at: 1 },
  { name: "idx_events_expires_at_ttl", expireAfterSeconds: 0, sparse: true }
);
