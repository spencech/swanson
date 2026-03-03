import { appendFileSync, renameSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { LogEntry } from "./types";

const LOG_DIR = "/workspace/logs";

export class ConversationLogger {
	private filePath: string;
	private experts: Set<string> = new Set();
	private timestamp: string;

	constructor(initialExpert: string) {
		if (!existsSync(LOG_DIR)) {
			mkdirSync(LOG_DIR, { recursive: true });
		}

		const now = new Date();
		this.timestamp = now.toISOString().replace(/T/, "_").replace(/:/g, "-").replace(/\.\d+Z/, "");
		this.experts.add("chris");
		this.experts.add(initialExpert);
		this.filePath = join(LOG_DIR, `${this.timestamp}_${this.getExpertSuffix()}.jsonl`);
	}

	private getExpertSuffix(): string {
		return Array.from(this.experts).join("-");
	}

	addExpert(expert: string): void {
		if (this.experts.has(expert)) return;

		const oldPath = this.filePath;
		this.experts.add(expert);
		const newPath = join(LOG_DIR, `${this.timestamp}_${this.getExpertSuffix()}.jsonl`);

		if (existsSync(oldPath)) {
			try {
				renameSync(oldPath, newPath);
			} catch (err) {
				console.error(`[logger] Failed to rename log file: ${err}`);
			}
		}

		this.filePath = newPath;
	}

	log(entry: LogEntry): void {
		try {
			const line = JSON.stringify({ ...entry, ts: entry.ts || new Date().toISOString() }) + "\n";
			appendFileSync(this.filePath, line);
		} catch (err) {
			console.error(`[logger] Failed to write log entry: ${err}`);
		}
	}

	getFilePath(): string {
		return this.filePath;
	}
}
