import { execFileSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const REPOS_DIR = "/workspace/repos";

// ─── Helper: Run ChunkHound CLI in a repo directory ────────────────────────────

function runChunkHound(args: string[], cwd: string): string {
	try {
		const result = execFileSync("chunkhound", args, {
			cwd,
			encoding: "utf-8",
			timeout: 30000,
			maxBuffer: 1024 * 1024 * 5,
		});
		return result.trim();
	} catch (err: unknown) {
		const error = err as { stderr?: string; message?: string };
		return `ChunkHound error: ${error.stderr || error.message || "Unknown error"}`;
	}
}

// ─── Helper: Resolve repo path ─────────────────────────────────────────────────

function resolveRepoPath(repo?: string): string[] {
	if (repo) {
		const repoPath = join(REPOS_DIR, repo);
		if (existsSync(repoPath)) return [repoPath];
		// Try fuzzy match
		const dirs = readdirSync(REPOS_DIR);
		const match = dirs.find(
			(d) => d.toLowerCase() === repo.toLowerCase() || d.includes(repo)
		);
		if (match) return [join(REPOS_DIR, match)];
		return [];
	}
	// All repos
	return readdirSync(REPOS_DIR)
		.map((d) => join(REPOS_DIR, d))
		.filter((p) => existsSync(join(p, ".git")));
}

// ─── Plan validation schema (simplified) ───────────────────────────────────────

const REQUIRED_PLAN_FIELDS = [
	"id",
	"title",
	"status",
	"narrative",
	"steps",
	"acceptance_criteria",
	"spawnee_config",
];
const VALID_STATUSES = ["draft", "refined", "approved", "exported"];
const REQUIRED_STEP_FIELDS = [
	"id",
	"title",
	"description",
	"repository",
	"files",
	"dependencies",
	"acceptance_criteria",
];

function validatePlanJson(plan: Record<string, unknown>): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	for (const field of REQUIRED_PLAN_FIELDS) {
		if (!(field in plan)) errors.push(`Missing required field: ${field}`);
	}

	if (plan.status && !VALID_STATUSES.includes(plan.status as string)) {
		errors.push(
			`Invalid status "${plan.status}". Must be one of: ${VALID_STATUSES.join(", ")}`
		);
	}

	if (
		plan.narrative &&
		typeof plan.narrative === "string" &&
		plan.narrative.length < 50
	) {
		errors.push("Narrative is too short — should be a meaningful description");
	}

	if (Array.isArray(plan.steps)) {
		for (let i = 0; i < plan.steps.length; i++) {
			const step = plan.steps[i] as Record<string, unknown>;
			for (const field of REQUIRED_STEP_FIELDS) {
				if (!(field in step))
					errors.push(`Step ${i + 1} missing required field: ${field}`);
			}
		}
	} else if ("steps" in plan) {
		errors.push("steps must be an array");
	}

	if (plan.spawnee_config) {
		const config = plan.spawnee_config as Record<string, unknown>;
		if (!config.model) errors.push("spawnee_config.model is required");
		if (!config.branch_prefix)
			errors.push("spawnee_config.branch_prefix is required");
	}

	return { valid: errors.length === 0, errors };
}

// ─── YAML conversion ──────────────────────────────────────────────────────────

function planToSpawneeYaml(plan: Record<string, unknown>): string {
	const config = plan.spawnee_config as Record<string, string>;
	const steps = plan.steps as Array<Record<string, unknown>>;

	const branchPrefix = config?.branch_prefix || "spawnee/feature";
	const model = config?.model || "composer-1";

	const lines: string[] = [];
	lines.push(`name: "${plan.title}"`);
	lines.push("repository:");
	lines.push(
		`  url: "https://github.com/TeachUpbeat/TO_BE_DETERMINED.git"`
	);
	lines.push(`  branch: "${branchPrefix}"`);
	lines.push(`  baseBranch: "${branchPrefix}"`);
	lines.push(`model: "${model}"`);
	lines.push("");
	lines.push("tasks:");

	if (steps) {
		for (const step of steps) {
			const taskId = (step.id as string) || "task";
			const deps = (step.dependencies as string[]) || [];
			const repo = step.repository as string;
			const files = (step.files as string[]) || [];
			const criteria = (step.acceptance_criteria as string[]) || [];

			lines.push(`  - id: ${taskId}`);
			lines.push(
				`    name: "${(step.title as string || "").replace(/"/g, '\\"')}"`
			);
			lines.push(`    branch: "${branchPrefix}-${taskId}"`);

			if (repo) {
				lines.push("    repository:");
				lines.push(
					`      url: "https://github.com/TeachUpbeat/${repo}.git"`
				);
				lines.push(`      branch: "${branchPrefix}"`);
				lines.push(`      baseBranch: "${branchPrefix}"`);
			}

			lines.push(`    dependsOn: [${deps.map((d) => `"${d}"`).join(", ")}]`);
			lines.push("    prompt: |");
			lines.push("      ## Branch Setup");
			lines.push("      ```bash");

			if (deps.length > 0) {
				lines.push("      git fetch origin");
				lines.push(`      git checkout ${branchPrefix}`);
				for (const dep of deps) {
					lines.push(
						`      git merge origin/${branchPrefix}-${dep} --no-edit`
					);
				}
			} else {
				lines.push(`      git checkout ${branchPrefix}`);
			}
			lines.push(`      git checkout -b ${branchPrefix}-${taskId}`);
			lines.push("      ```");
			lines.push("");
			lines.push("      ## Task");
			lines.push(`      ${step.description}`);

			if (files.length > 0) {
				lines.push("");
				lines.push("      ## Files");
				for (const f of files) {
					lines.push(`      - ${f}`);
				}
			}

			if (criteria.length > 0) {
				lines.push("");
				lines.push("      ## Acceptance Criteria");
				for (const c of criteria) {
					lines.push(`      - ${c}`);
				}
			}

			lines.push("");
			lines.push("      ## PR");
			lines.push(
				`      Create a PR targeting \`${branchPrefix}\` (NOT develop/main).`
			);
			lines.push("");
		}
	}

	return lines.join("\n");
}

// ─── Plugin registration ───────────────────────────────────────────────────────

export default function (api: {
	registerTool: (config: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
		execute: (
			id: string,
			params: Record<string, unknown>
		) => Promise<{ content: Array<{ type: string; text: string }> }>;
	}) => void;
}) {
	// search_semantic: Concept-based code search
	api.registerTool({
		name: "search_semantic",
		description:
			"Search code by meaning/concept across TeachUpbeat repositories. Use when you're unsure of exact keywords.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Natural language search query",
				},
				repo: {
					type: "string",
					description:
						"Optional repository name to scope search (e.g., 'user-administrator')",
				},
				path: {
					type: "string",
					description:
						"Optional path prefix to scope search (e.g., 'src/routes')",
				},
			},
			required: ["query"],
		},
		execute: async (_id, params) => {
			const repoPaths = resolveRepoPath(params.repo as string | undefined);
			if (repoPaths.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `Repository "${params.repo}" not found. Available repos: ${readdirSync(REPOS_DIR).join(", ")}`,
						},
					],
				};
			}

			const results: string[] = [];
			for (const repoPath of repoPaths) {
				const args = ["search", "--semantic", params.query as string];
				if (params.path) args.push("--path", params.path as string);
				const output = runChunkHound(args, repoPath);
				if (output && !output.startsWith("ChunkHound error")) {
					results.push(`## ${repoPath.split("/").pop()}\n${output}`);
				}
			}

			return {
				content: [
					{
						type: "text",
						text:
							results.length > 0
								? results.join("\n\n")
								: "No results found for the given query.",
					},
				],
			};
		},
	});

	// search_regex: Pattern-based code search
	api.registerTool({
		name: "search_regex",
		description:
			"Search code using regex patterns across TeachUpbeat repositories. Use for exact function names, imports, or code patterns.",
		parameters: {
			type: "object",
			properties: {
				pattern: {
					type: "string",
					description: "Regex pattern to search for",
				},
				repo: {
					type: "string",
					description: "Optional repository name to scope search",
				},
				path: {
					type: "string",
					description: "Optional path prefix to scope search",
				},
			},
			required: ["pattern"],
		},
		execute: async (_id, params) => {
			const repoPaths = resolveRepoPath(params.repo as string | undefined);
			if (repoPaths.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `Repository "${params.repo}" not found. Available repos: ${readdirSync(REPOS_DIR).join(", ")}`,
						},
					],
				};
			}

			const results: string[] = [];
			for (const repoPath of repoPaths) {
				const args = ["search", "--regex", params.pattern as string];
				if (params.path) args.push("--path", params.path as string);
				const output = runChunkHound(args, repoPath);
				if (output && !output.startsWith("ChunkHound error")) {
					results.push(`## ${repoPath.split("/").pop()}\n${output}`);
				}
			}

			return {
				content: [
					{
						type: "text",
						text:
							results.length > 0
								? results.join("\n\n")
								: "No results found for the given pattern.",
					},
				],
			};
		},
	});

	// code_research: Deep multi-file architectural analysis
	api.registerTool({
		name: "code_research",
		description:
			"Deep multi-file analysis for architectural questions spanning multiple repositories. Returns comprehensive analysis.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Architectural question to research (e.g., 'How does the authentication flow work?')",
				},
			},
			required: ["query"],
		},
		execute: async (_id, params) => {
			const repoPaths = resolveRepoPath();
			const results: string[] = [];

			for (const repoPath of repoPaths) {
				const args = ["research", params.query as string];
				const output = runChunkHound(args, repoPath);
				if (output && !output.startsWith("ChunkHound error")) {
					results.push(`## ${repoPath.split("/").pop()}\n${output}`);
				}
			}

			return {
				content: [
					{
						type: "text",
						text:
							results.length > 0
								? results.join("\n\n")
								: "No relevant results found across repositories.",
					},
				],
			};
		},
	});

	// refresh_repos: Pull latest code and re-index
	api.registerTool({
		name: "refresh_repos",
		description:
			"Pull latest code from all TeachUpbeat repositories and re-index with ChunkHound. Use when the user mentions code is stale or before planning against recently changed repos.",
		parameters: {
			type: "object",
			properties: {
				repo: {
					type: "string",
					description:
						"Optional: refresh only a specific repo by name. Omit to refresh all.",
				},
			},
		},
		execute: async (_id, params) => {
			const targetRepo = params.repo as string | undefined;
			const repoPaths = resolveRepoPath(targetRepo);

			if (repoPaths.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: targetRepo
								? `Repository "${targetRepo}" not found. Available repos: ${readdirSync(REPOS_DIR).join(", ")}`
								: "No repositories found.",
						},
					],
				};
			}

			const results: string[] = [];
			for (const repoPath of repoPaths) {
				const repoName = repoPath.split("/").pop();
				try {
					// git pull
					execFileSync("git", ["pull", "--ff-only"], {
						cwd: repoPath,
						encoding: "utf-8",
						timeout: 30000,
					});
					// re-index
					const indexResult = runChunkHound(["index", "."], repoPath);
					results.push(
						`${repoName}: refreshed and re-indexed${indexResult.startsWith("ChunkHound error") ? ` (index warning: ${indexResult})` : ""}`
					);
				} catch (err: unknown) {
					const error = err as { message?: string };
					results.push(
						`${repoName}: refresh failed — ${error.message || "Unknown error"}`
					);
				}
			}

			return {
				content: [
					{
						type: "text",
						text: `Repo refresh results:\n${results.map((r) => `- ${r}`).join("\n")}`,
					},
				],
			};
		},
	});

	// validate_plan: Validate plan JSON against schema
	api.registerTool({
		name: "validate_plan",
		description:
			"Validate a plan JSON object against the IPlan schema. Always call before sending a plan to the client.",
		parameters: {
			type: "object",
			properties: {
				plan_json: {
					type: "string",
					description: "The plan as a JSON string",
				},
			},
			required: ["plan_json"],
		},
		execute: async (_id, params) => {
			try {
				const plan = JSON.parse(params.plan_json as string);
				const result = validatePlanJson(plan);
				return {
					content: [
						{
							type: "text",
							text: result.valid
								? "Plan is valid."
								: `Plan validation failed:\n${result.errors.map((e) => `- ${e}`).join("\n")}`,
						},
					],
				};
			} catch (err: unknown) {
				const error = err as { message?: string };
				return {
					content: [
						{
							type: "text",
							text: `Invalid JSON: ${error.message || "Parse error"}`,
						},
					],
				};
			}
		},
	});

	// convert_to_spawnee_yaml: Generate spawnee YAML from plan
	api.registerTool({
		name: "convert_to_spawnee_yaml",
		description:
			"Convert an approved plan JSON to a downloadable spawnee YAML template. Returns the YAML content.",
		parameters: {
			type: "object",
			properties: {
				plan_json: {
					type: "string",
					description: "The plan as a JSON string",
				},
			},
			required: ["plan_json"],
		},
		execute: async (_id, params) => {
			try {
				const plan = JSON.parse(params.plan_json as string);
				const validation = validatePlanJson(plan);
				if (!validation.valid) {
					return {
						content: [
							{
								type: "text",
								text: `Cannot convert invalid plan:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`,
							},
						],
					};
				}
				const yaml = planToSpawneeYaml(plan);
				return { content: [{ type: "text", text: yaml }] };
			} catch (err: unknown) {
				const error = err as { message?: string };
				return {
					content: [
						{
							type: "text",
							text: `Conversion error: ${error.message || "Unknown error"}`,
						},
					],
				};
			}
		},
	});
}
