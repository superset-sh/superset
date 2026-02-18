/**
 * SFTP Service
 *
 * Provides remote file access via SFTP subsystem.
 */

import type { SSHConnection } from "./connection";

export interface RemoteFileInfo {
	name: string;
	path: string;
	size: number;
	isDirectory: boolean;
	modifiedAt: Date;
}

export class SFTPService {
	private connection: SSHConnection;

	constructor(connection: SSHConnection) {
		this.connection = connection;
	}

	setConnection(connection: SSHConnection): void {
		this.connection = connection;
	}

	/**
	 * Read a remote file's contents.
	 */
	async readFile(remotePath: string): Promise<Buffer> {
		const sftp = await this.connection.getSftp();
		return new Promise((resolve, reject) => {
			sftp.readFile(remotePath, (err, data) => {
				if (err) return reject(err);
				resolve(data);
			});
		});
	}

	/**
	 * Read a remote file as a string.
	 */
	async readFileText(
		remotePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> {
		const buffer = await this.readFile(remotePath);
		return buffer.toString(encoding);
	}

	/**
	 * Write contents to a remote file.
	 */
	async writeFile(remotePath: string, data: Buffer | string): Promise<void> {
		const sftp = await this.connection.getSftp();
		return new Promise((resolve, reject) => {
			sftp.writeFile(remotePath, data, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	/**
	 * List files in a remote directory.
	 */
	async readdir(remotePath: string): Promise<RemoteFileInfo[]> {
		const sftp = await this.connection.getSftp();
		return new Promise((resolve, reject) => {
			sftp.readdir(remotePath, (err, list) => {
				if (err) return reject(err);
				resolve(
					list.map((entry) => ({
						name: entry.filename,
						path: `${remotePath}/${entry.filename}`,
						size: entry.attrs.size,
						isDirectory: (entry.attrs.mode & 0o40000) !== 0,
						modifiedAt: new Date(entry.attrs.mtime * 1000),
					})),
				);
			});
		});
	}

	/**
	 * Check if a remote file/directory exists.
	 */
	async exists(remotePath: string): Promise<boolean> {
		const sftp = await this.connection.getSftp();
		return new Promise((resolve) => {
			sftp.stat(remotePath, (err) => {
				resolve(!err);
			});
		});
	}

	/**
	 * Get file stats.
	 */
	async stat(
		remotePath: string,
	): Promise<{ size: number; isDirectory: boolean; modifiedAt: Date }> {
		const sftp = await this.connection.getSftp();
		return new Promise((resolve, reject) => {
			sftp.stat(remotePath, (err, stats) => {
				if (err) return reject(err);
				resolve({
					size: stats.size,
					isDirectory: (stats.mode & 0o40000) !== 0,
					modifiedAt: new Date(stats.mtime * 1000),
				});
			});
		});
	}
}
