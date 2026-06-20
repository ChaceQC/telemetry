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
