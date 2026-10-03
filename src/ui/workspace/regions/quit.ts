/**
 * Quitting is a teardown, not a client detach: `quitWorkspace` removes the tmux workspace session so
 * no orphan agent panes survive, and `detach` stays as the fallback for hosts that only offer it.
 */
export type WorkspaceQuittableHost = {
	detach?: () => Promise<void>;
	quitWorkspace?: () => Promise<void>;
};

export async function quitWorkspaceHost(host: WorkspaceQuittableHost): Promise<void> {
	if (host.quitWorkspace) {
		await host.quitWorkspace();
		return;
	}
	await host.detach?.();
}
