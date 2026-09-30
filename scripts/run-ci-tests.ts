import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";

const DEFAULT_LANES = 6;
const TERMINATION_GRACE_MS = 1_000;
const PLATFORM_CONTRACT_FILES = [
	"src/test/atomic-task-create.test.ts",
	"src/test/auto-commit.test.ts",
	"src/test/backlog-directory.test.ts",
	"src/test/code-path.test.ts",
	"src/test/description-newlines.test.ts",
	"src/test/docs-recursive.test.ts",
	"src/test/duplicate-task-repair.test.ts",
	"src/test/filesystem.test.ts",
	"src/test/find-backlog-root.test.ts",
	"src/test/git.test.ts",
	"src/test/id-generation.test.ts",
	"src/test/markdown.test.ts",
	"src/test/task-id-resolution.test.ts",
	"src/test/task-identity-index.test.ts",
	"src/test/test-utils.test.ts",
	"src/test/unicode-rendering.test.ts",
	"src/test/worktree-refresh.test.ts",
	"src/test/worktree-task-id-allocation.test.ts",
	"src/test/agent-instructions.test.ts",
	"src/test/cli-browser-port.test.ts",
	"src/test/cli-doctor.test.ts",
	"src/test/cli-init-create.test.ts",
	"src/test/cli-launcher.test.ts",
	"src/test/config-commands.test.ts",
	"src/test/editor.test.ts",
	"src/test/offline-mode.test.ts",
	"src/test/packaging-bin.test.ts",
	"src/test/resolveBinary.test.ts",
	"src/test/runtime-cwd.test.ts",
	"src/test/status-callback.test.ts",
	"src/test/terminal-status.test.ts",
	"src/test/cli-json-watch.test.ts",
	"src/test/cli-pipe-output.test.ts",
	"src/test/watch-json.test.ts",
	"src/test/mcp-server.test.ts",
	"src/test/mcp-stdio-exit.test.ts",
	"src/test/server-browser-open.test.ts",
	"src/test/server-hostname.test.ts",
	"src/test/server-init.test.ts",
	"src/test/server-port.test.ts",
] as const;

type FileResult = {
	file: string;
	exitCode: number;
	output: string;
	passedTests: number;
	wallTimeMs: number;
	timedOut: boolean;
};

type ActiveFile = { file: string; startedAt: number };

const deadlineValue = process.env.BACKLOG_TEST_DEADLINE_MS;
const deadlineMs = deadlineValue === undefined ? undefined : Number(deadlineValue);
const requestedLanes = Number(process.env.BACKLOG_TEST_LANES ?? DEFAULT_LANES);
const reportPath = process.env.BACKLOG_TEST_REPORT?.trim();
const profileArgument = process.argv.find((argument) => argument.startsWith("--profile="));
const profile = profileArgument?.slice("--profile=".length) ?? "full";

if (
	(deadlineMs !== undefined && (!Number.isFinite(deadlineMs) || deadlineMs <= 0)) ||
	!Number.isInteger(requestedLanes) ||
	requestedLanes <= 0
) {
	console.error("BACKLOG_TEST_DEADLINE_MS and BACKLOG_TEST_LANES must be positive numbers.");
	process.exit(2);
}
if (profile !== "full" && profile !== "platform") {
	console.error(`Unknown CI test profile: ${profile}`);
	process.exit(2);
}

// Match Bun's supported .test and .spec naming conventions for the source suite.
const allTestFiles = [...new Bun.Glob("src/**/*.{test,spec}.{ts,tsx}").scanSync()]
	.map((file) => file.replaceAll("\\", "/"))
	.sort();
const selectedFiles = new Set(process.argv.slice(2).filter((argument) => allTestFiles.includes(argument)));
const forwardedArguments = process.argv
	.slice(2)
	.filter((argument) => argument !== profileArgument && !selectedFiles.has(argument));
const domTestFiles = new Set<string>(["src/test/react-dom-preload.test.ts"]);
const jsdomReference = /["']jsdom["']/;
for (const file of allTestFiles) {
	if (jsdomReference.test(await Bun.file(file).text())) domTestFiles.add(file);
}
const profileFiles = profile === "platform" ? [...PLATFORM_CONTRACT_FILES] : allTestFiles;
const testFiles = selectedFiles.size > 0 ? profileFiles.filter((file) => selectedFiles.has(file)) : profileFiles;

if (testFiles.length === 0) {
	console.error("No test files discovered.");
	process.exit(1);
}

function terminateProcessGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
	try {
		if (process.platform === "win32") {
			Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"]);
		} else {
			process.kill(-pid, signal);
		}
	} catch {
		// The child can finish between the timeout firing and cancellation.
	}
}

async function buildTestCliBundle(): Promise<{ path: string; buildTimeMs: number; cleanup: () => Promise<void> }> {
	const directory = await mkdtemp(join(tmpdir(), "backlog-test-cli-"));
	const path = join(directory, "index.js");
	const startedAt = performance.now();
	const result = await Bun.build({
		entrypoints: ["src/cli/index.ts"],
		target: "bun",
		outdir: directory,
		plugins: [tailwind],
		throw: false,
	});
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		await rm(directory, { recursive: true, force: true });
		throw new Error("Failed to build the test CLI bundle.");
	}
	return {
		path,
		buildTimeMs: performance.now() - startedAt,
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
}

function passedTestCount(output: string): number {
	return [...output.matchAll(/(\d+)\s+pass\b/g)].reduce((total, match) => total + Number(match[1]), 0);
}

const suiteStartedAt = performance.now();
const activeFiles = new Map<number, ActiveFile>();
const results: FileResult[] = [];
let timedOut = false;
let completedTests = 0;
let activeAtDeadline: Array<ActiveFile & { wallTimeMs: number }> = [];

async function runFile(file: string, cliBundlePath: string): Promise<FileResult> {
	const startedAt = performance.now();
	const skipDomPreload = !domTestFiles.has(file);
	const argumentsForFile = (
		skipDomPreload ? forwardedArguments : forwardedArguments.filter((argument) => !argument.startsWith("--parallel"))
	).map((argument) =>
		argument.replace(/--reporter-outfile=(.*)\.xml$/, `--reporter-outfile=$1-${file.replaceAll(/[/.]/g, "-")}.xml`),
	);
	const child = Bun.spawn([process.execPath, "test", file, ...argumentsForFile], {
		detached: process.platform !== "win32",
		env: {
			...process.env,
			BACKLOG_TEST_CLI_BUNDLE: cliBundlePath,
			...(skipDomPreload ? { BACKLOG_TEST_SKIP_DOM_PRELOAD: "1" } : {}),
		},
		stdout: "pipe",
		stderr: "pipe",
		stdin: "inherit",
	});
	activeFiles.set(child.pid, { file, startedAt });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	activeFiles.delete(child.pid);
	const output = stdout + stderr;
	return {
		file,
		exitCode,
		output,
		passedTests: passedTestCount(output),
		wallTimeMs: performance.now() - startedAt,
		timedOut,
	};
}

async function writeReport(bundleBuildTimeMs: number): Promise<void> {
	if (!reportPath) return;
	const finished = results.filter((result) => !result.timedOut);
	const report = {
		elapsedMs: performance.now() - suiteStartedAt,
		bundleBuildTimeMs,
		deadlineMs,
		lanes: Math.min(requestedLanes, testFiles.length),
		totalFiles: testFiles.length,
		completedFiles: finished.length,
		completedTests,
		failedFiles: results.filter((result) => result.exitCode !== 0).map((result) => result.file),
		pendingFiles: testFiles.filter((file) => !results.some((result) => result.file === file)),
		activeAtDeadline,
		slowestFiles: [...results]
			.toSorted((left, right) => right.wallTimeMs - left.wallTimeMs)
			.slice(0, 20)
			.map(({ file, wallTimeMs, exitCode, passedTests, timedOut }) => ({
				file,
				wallTimeMs,
				exitCode,
				passedTests,
				timedOut,
			})),
	};
	await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

let cliBundle: Awaited<ReturnType<typeof buildTestCliBundle>> | undefined;
const deadline =
	deadlineMs === undefined
		? undefined
		: setTimeout(() => {
				timedOut = true;
				activeAtDeadline = [...activeFiles.values()].map(({ file, startedAt }) => ({
					file,
					startedAt,
					wallTimeMs: performance.now() - startedAt,
				}));
				for (const pid of activeFiles.keys()) terminateProcessGroup(pid, "SIGTERM");
				setTimeout(() => {
					for (const pid of activeFiles.keys()) terminateProcessGroup(pid, "SIGKILL");
				}, TERMINATION_GRACE_MS).unref();
			}, deadlineMs);
try {
	cliBundle = await buildTestCliBundle();
	console.log(`Built shared Bun CLI bundle in ${(cliBundle.buildTimeMs / 1000).toFixed(2)}s.`);
	const bundle = cliBundle;
	let nextFile = 0;
	const workers = Array.from({ length: Math.min(requestedLanes, testFiles.length) }, async () => {
		while (!timedOut) {
			const file = testFiles[nextFile++];
			if (!file) return;
			const result = await runFile(file, bundle.path);
			results.push(result);
			completedTests += result.passedTests;
			console.log(
				`Progress: ${results.length}/${testFiles.length} files, ${completedTests} passed tests; ${file} ${
					result.exitCode === 0 ? "passed" : "failed"
				} in ${(result.wallTimeMs / 1000).toFixed(2)}s.`,
			);
		}
	});
	await Promise.all(workers);
	const elapsedMs = performance.now() - suiteStartedAt;
	const failures = results.filter((result) => result.exitCode !== 0);
	for (const result of failures) {
		console.error(`\nTest file failed after ${(result.wallTimeMs / 1000).toFixed(2)}s: ${result.file}`);
		console.error(result.output);
	}
	await writeReport(cliBundle.buildTimeMs);
	if (timedOut) {
		const completedFiles = results.filter((result) => !result.timedOut).length;
		console.error(
			`Test suite stopped after ${(elapsedMs / 1000).toFixed(2)}s: ${completedFiles}/${testFiles.length} files and ${completedTests} passed tests completed.`,
		);
		console.error(
			`Pending files: ${testFiles.filter((file) => !results.some((result) => result.file === file)).join(", ") || "none"}`,
		);
		process.exitCode = 1;
	} else {
		console.log(
			`Test suite completed ${results.length}/${testFiles.length} files and ${completedTests} passed tests in ${(elapsedMs / 1000).toFixed(2)}s across ${Math.min(requestedLanes, testFiles.length)} isolated workers.`,
		);
	}
	if (failures.length > 0) process.exitCode = 1;
} finally {
	if (deadline) clearTimeout(deadline);
	await cliBundle?.cleanup();
}
