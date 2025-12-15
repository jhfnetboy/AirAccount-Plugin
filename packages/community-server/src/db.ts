import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('local.db');
export const db = drizzle(sqlite);
export const adapter = sqlite; // export raw adapter for better-auth if needed
