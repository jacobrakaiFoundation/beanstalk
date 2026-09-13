import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";

const database = new AppDatabase(loadConfig().databasePath);
database.close();
