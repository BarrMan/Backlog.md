import { findBacklogRoot } from "../utils/find-backlog-root.ts";
import { resolveRuntimeCwd } from "../utils/runtime-cwd.ts";

/** Startup capabilities shared by command registrations without exposing process-wide state. */
export class CliRuntime {
	readonly hasInteractiveTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);

	async cwd(override?: string): Promise<string> {
		try {
			return (await resolveRuntimeCwd(override ? { cwd: override } : undefined)).cwd;
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	}

	async findProjectRoot(override?: string): Promise<string | null> {
		return findBacklogRoot(await this.cwd(override));
	}

	async projectRoot(): Promise<string> {
		const root = await this.findProjectRoot();
		if (root) return root;
		console.error("No Backlog.md project found. Run `backlog init` to initialize.");
		process.exit(1);
	}
}
