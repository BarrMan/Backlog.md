import { createHash } from "node:crypto";
import type { Core } from "../core/backlog.ts";
import type { ProjectTaskGraph } from "../core/project-task-graph.ts";

/** Server-owned frozen binding. Tokens are compared, never decoded into filesystem authority. */
export class ProjectScope {
	readonly root: string;
	readonly backlog: string;
	readonly config: string;
	readonly directory: string;
	readonly configLocation: "root" | "folder";
	readonly token: string;

	constructor(private readonly core: Core) {
		const { filesystem } = core;
		// Core froze these paths while it was constructed. Re-resolving them here could
		// bind the token to a different target than the operation will use.
		this.root = filesystem.rootDir;
		this.backlog = filesystem.backlogDir;
		this.config = filesystem.configFilePath;
		this.directory = filesystem.backlogDirName;
		this.configLocation = filesystem.resolveBacklogDirectoryInfo().configSource ?? "folder";
		this.token = createHash("sha256").update(`${this.root}\0${this.backlog}\0${this.config}`).digest("base64url");
		Object.freeze(this);
	}

	validate(token: string | null, set: { status?: number | string }): { error: string; code: string } | undefined {
		if (!token) set.status = 400;
		else if (token !== this.token) set.status = 409;
		else return;
		return {
			error: token ? "Project scope does not match this server" : "Project scope is required",
			code: token ? "PROJECT_SCOPE_MISMATCH" : "PROJECT_SCOPE_REQUIRED",
		};
	}

	requestCore(): Core {
		return this.core;
	}
}

export type ServerRequestScope = { scope: ProjectScope; core: Core; graph?: ProjectTaskGraph };
