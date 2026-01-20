import * as SQLite from "expo-sqlite";

export interface Todo {
	id: number;
	title: string;
	completed: boolean;
	createdAt: string;
}

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase() {
	if (db) return db;

	db = await SQLite.openDatabaseAsync("superset.db");

	// Create todos table
	await db.execAsync(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

	return db;
}

export async function getTodos(): Promise<Todo[]> {
	const database = await initDatabase();
	const result = await database.getAllAsync<{
		id: number;
		title: string;
		completed: number;
		created_at: string;
	}>("SELECT * FROM todos ORDER BY created_at DESC");

	return result.map((row) => ({
		id: row.id,
		title: row.title,
		completed: Boolean(row.completed),
		createdAt: row.created_at,
	}));
}

export async function addTodo(title: string): Promise<Todo> {
	const database = await initDatabase();
	const result = await database.runAsync(
		"INSERT INTO todos (title) VALUES (?)",
		title,
	);

	const newTodo = await database.getFirstAsync<{
		id: number;
		title: string;
		completed: number;
		created_at: string;
	}>("SELECT * FROM todos WHERE id = ?", result.lastInsertRowId);

	if (!newTodo) {
		throw new Error("Failed to create todo");
	}

	return {
		id: newTodo.id,
		title: newTodo.title,
		completed: Boolean(newTodo.completed),
		createdAt: newTodo.created_at,
	};
}

export async function toggleTodo(id: number): Promise<void> {
	const database = await initDatabase();
	await database.runAsync(
		"UPDATE todos SET completed = NOT completed WHERE id = ?",
		id,
	);
}

export async function deleteTodo(id: number): Promise<void> {
	const database = await initDatabase();
	await database.runAsync("DELETE FROM todos WHERE id = ?", id);
}
