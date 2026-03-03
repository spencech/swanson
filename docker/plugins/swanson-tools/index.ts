import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const REPOS_DIR = "/workspace/repos";
const MEMORY_DIR = "/workspace/repos/swanson-db";

// ─── Helper: Run beads CLI in the memory directory ──────────────────────────

function runBd(args: string[]): string {
	try {
		const result = execFileSync("bd", args, {
			cwd: MEMORY_DIR,
			encoding: "utf-8",
			timeout: 15000,
			maxBuffer: 1024 * 1024 * 2,
			env: { ...process.env, BD_ACTOR: "swanson-agent" },
		});
		return result.trim();
	} catch (err: unknown) {
		const error = err as { code?: string; stderr?: string; stdout?: string; message?: string };
		if (error.code === "ENOENT") {
			return "bd error: bd binary not found — is beads installed?";
		}
		const msg = error.stderr || error.stdout || error.message || "Unknown error";
		if (msg.includes("dolt") || msg.includes("Dolt")) {
			return `bd error: Dolt not installed or not functional — ${msg}`;
		}
		return `bd error: ${msg}`;
	}
}

function pushMemoryToGitHub(message: string): string {
	try {
		// Step 1: bd sync (Dolt → JSONL export)
		const syncResult = runBd(["sync"]);
		if (syncResult.startsWith("bd error:")) {
			return `push warning: bd sync failed — ${syncResult}`;
		}

		// Step 2: Stage beads files
		execFileSync("git", ["add", ".beads/"], {
			cwd: MEMORY_DIR,
			encoding: "utf-8",
			timeout: 10000,
		});

		// Step 3: Commit with descriptive message
		execFileSync("git", ["commit", "-m", `memory: ${message}`, "--allow-empty"], {
			cwd: MEMORY_DIR,
			encoding: "utf-8",
			timeout: 10000,
		});

		// Step 4: Push to origin
		execFileSync("git", ["push", "origin", "HEAD"], {
			cwd: MEMORY_DIR,
			encoding: "utf-8",
			timeout: 30000,
		});

		return "pushed";
	} catch (err: unknown) {
		const error = err as { stderr?: string; message?: string };
		const msg = error.stderr || error.message || "Unknown error";
		// Non-fatal: memory is still local even if push fails
		return `push warning: ${msg}`;
	}
}

function runBdJson<T>(args: string[]): T | null {
	const result = runBd([...args, "--json"]);
	if (result.startsWith("bd error:")) return null;
	try {
		return JSON.parse(result) as T;
	} catch {
		return null;
	}
}

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

	// ─── Episodic Memory Tools (beads graph in swanson-db) ──────────────────────

	// remember: Create a new memory node in the graph
	api.registerTool({
		name: "remember",
		description:
			"Store a durable memory in the episodic graph. Use when a user teaches a convention, you discover an architectural pattern, a decision is made with rationale, or you need to correct a prior understanding. Do NOT store session-specific or transient information.",
		parameters: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Short summary of the memory (used as issue title)",
				},
				content: {
					type: "string",
					description: "Full description of what to remember and why it matters",
				},
				category: {
					type: "string",
					enum: ["observation", "decision", "correction", "convention", "outcome"],
					description:
						"observation: architectural/behavioral fact; decision: choice with rationale; correction: fix a prior misunderstanding; convention: team/project rule; outcome: result of completed work",
				},
				importance: {
					type: "string",
					enum: ["critical", "high", "normal", "low"],
					description: "How important this memory is (default: normal)",
				},
				domains: {
					type: "array",
					items: { type: "string" },
					description: "Topic tags (e.g., ['authentication', 'angular', 'database'])",
				},
				related_to: {
					type: "array",
					items: { type: "string" },
					description: "Beads issue IDs this memory relates to (bidirectional)",
				},
				caused_by: {
					type: "string",
					description: "Beads issue ID that caused/led to this memory",
				},
				supersedes: {
					type: "string",
					description: "Beads issue ID this memory replaces (old memory will be closed)",
				},
				source: {
					type: "string",
					enum: ["user", "agent"],
					description: "Who contributed this memory (default: agent)",
				},
			},
			required: ["title", "content", "category"],
		},
		execute: async (_id, params) => {
			const title = params.title as string;
			const content = params.content as string;
			const category = params.category as string;
			const importance = (params.importance as string) || "normal";
			const domains = (params.domains as string[]) || [];
			const relatedTo = (params.related_to as string[]) || [];
			const causedBy = params.caused_by as string | undefined;
			const supersedes = params.supersedes as string | undefined;
			const source = (params.source as string) || "agent";

			// Map category to beads type
			const typeMap: Record<string, string> = {
				observation: "task",
				decision: "decision",
				correction: "bug",
				convention: "chore",
				outcome: "feature",
			};
			const beadsType = typeMap[category] || "task";

			// Map importance to priority
			const priorityMap: Record<string, string> = {
				critical: "0",
				high: "1",
				normal: "2",
				low: "3",
			};
			const priority = priorityMap[importance] || "2";

			// Build labels
			const labels = [`memory:${category}`, `memory:source:${source}`];
			for (const d of domains) {
				labels.push(`memory:domain:${d}`);
			}

			// Build metadata
			const metadata = JSON.stringify({
				confidence: importance === "correction" ? "medium" : "high",
				source,
				access_count: 0,
				last_accessed: new Date().toISOString(),
				decay_score: 0,
				domain_tags: domains,
			});

			// Create the beads issue
			const createArgs = [
				"create",
				"--title", title,
				"--description", content,
				"--type", beadsType,
				"--priority", priority,
				"--labels", labels.join(","),
				"--metadata", metadata,
				"--silent",
			];

			const createResult = runBd(createArgs);
			if (createResult.startsWith("bd error:")) {
				return { content: [{ type: "text", text: `Failed to create memory: ${createResult}` }] };
			}

			// Extract the issue ID from output
			const idMatch = createResult.match(/(memory-[a-z0-9]+)/i) || createResult.match(/(beads-[a-z0-9]+)/i);
			const memoryId = idMatch ? idMatch[1] : createResult.trim();

			const edges: string[] = [];

			// Create relationship edges
			for (const relId of relatedTo) {
				const relResult = runBd(["relate", memoryId, relId]);
				if (!relResult.startsWith("bd error:")) edges.push(`relates-to: ${relId}`);
			}

			if (causedBy) {
				const depResult = runBd(["dep", "add", memoryId, causedBy, "--type", "caused-by"]);
				if (!depResult.startsWith("bd error:")) edges.push(`caused-by: ${causedBy}`);
			}

			if (supersedes) {
				const supResult = runBd(["supersede", supersedes, "--with", memoryId]);
				if (!supResult.startsWith("bd error:")) edges.push(`supersedes: ${supersedes}`);
			}

			// Push to GitHub
			const pushResult = pushMemoryToGitHub(`remember: ${title}`);
			const pushNote = pushResult !== "pushed" ? `\n[${pushResult}]` : "";

			const edgeInfo = edges.length > 0 ? `\nEdges: ${edges.join(", ")}` : "";
			return {
				content: [{
					type: "text",
					text: `Memory stored: ${memoryId} [${category}/${importance}] "${title}"${edgeInfo}${pushNote}`,
				}],
			};
		},
	});

	// recall: Search and retrieve memories with graph traversal
	api.registerTool({
		name: "recall",
		description:
			"Search episodic memory by keyword, domain, or category. Returns matching memories plus related nodes via graph traversal. Use at the start of every session and before answering architecture questions.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search keywords to find relevant memories",
				},
				domain: {
					type: "string",
					description: "Filter by domain tag (e.g., 'authentication', 'database')",
				},
				category: {
					type: "string",
					enum: ["observation", "decision", "correction", "convention", "outcome"],
					description: "Filter by memory category",
				},
				max_results: {
					type: "number",
					description: "Maximum direct matches to return (default: 5, max: 10)",
				},
				hops: {
					type: "number",
					description: "Graph traversal depth for related memories (default: 1, max: 2)",
				},
				include_closed: {
					type: "boolean",
					description: "Include superseded/archived memories (default: false)",
				},
			},
			required: ["query"],
		},
		execute: async (_id, params) => {
			const query = params.query as string;
			const domain = params.domain as string | undefined;
			const category = params.category as string | undefined;
			const maxResults = Math.min((params.max_results as number) || 5, 10);
			const hops = Math.min((params.hops as number) || 1, 2);
			const includeClosed = (params.include_closed as boolean) || false;

			// Phase 1: Search for entry-point nodes
			const searchArgs = ["search", query, "--limit", String(maxResults)];
			if (!includeClosed) searchArgs.push("--status", "open");

			// Add label filters
			if (domain) searchArgs.push("--label", `memory:domain:${domain}`);
			if (category) searchArgs.push("--label", `memory:${category}`);

			interface BeadsIssue {
				id: string;
				title: string;
				description?: string;
				type?: string;
				status?: string;
				priority?: number;
				labels?: string[];
				metadata?: Record<string, unknown>;
				created?: string;
			}

			const directMatches = runBdJson<BeadsIssue[]>(searchArgs) || [];

			if (directMatches.length === 0) {
				// Fallback: try bd list with label filter
				const listArgs = ["list", "--status", includeClosed ? "all" : "open"];
				if (category) listArgs.push("--label", `memory:${category}`);
				if (domain) listArgs.push("--label", `memory:domain:${domain}`);
				const listResults = runBdJson<BeadsIssue[]>(listArgs) || [];

				if (listResults.length === 0) {
					return {
						content: [{
							type: "text",
							text: `No memories found for query: "${query}"`,
						}],
					};
				}

				// Filter by keyword in title/description
				const filtered = listResults.filter((item) => {
					const text = `${item.title} ${item.description || ""}`.toLowerCase();
					return query.toLowerCase().split(/\s+/).some((word) => text.includes(word));
				}).slice(0, maxResults);

				if (filtered.length === 0) {
					return {
						content: [{
							type: "text",
							text: `No memories found matching: "${query}"`,
						}],
					};
				}

				// Use filtered results as direct matches
				directMatches.push(...filtered);
			}

			// Phase 2: Graph traversal for related nodes
			const visited = new Set(directMatches.map((m) => m.id));
			const relatedMemories: BeadsIssue[] = [];

			const traverseNode = (nodeId: string, currentHop: number): void => {
				if (currentHop > hops) return;

				// Get dependencies in both directions
				for (const direction of ["down", "up"]) {
					const depResult = runBdJson<Array<{ id: string }>>([
						"dep", "list", nodeId, `--direction=${direction}`,
					]);
					if (!depResult) continue;

					for (const dep of depResult) {
						if (visited.has(dep.id)) continue;
						visited.add(dep.id);

						const detail = runBdJson<BeadsIssue>(["show", dep.id]);
						if (detail) {
							relatedMemories.push(detail);
							if (currentHop + 1 <= hops) {
								traverseNode(dep.id, currentHop + 1);
							}
						}
					}
				}
			};

			for (const match of directMatches) {
				traverseNode(match.id, 1);
			}

			// Phase 3: Format results
			const lines: string[] = [];

			lines.push(`## Memory Recall: "${query}"`);
			lines.push(`Found ${directMatches.length} direct match(es), ${relatedMemories.length} related.\n`);

			for (const m of directMatches) {
				const labels = (m.labels || []).filter((l) => l.startsWith("memory:")).join(", ");
				lines.push(`### [MATCH] ${m.id}: ${m.title}`);
				lines.push(`- **Type**: ${m.type || "unknown"} | **Priority**: P${m.priority ?? "?"} | **Status**: ${m.status || "unknown"}`);
				if (labels) lines.push(`- **Labels**: ${labels}`);
				if (m.description) lines.push(`- **Content**: ${m.description}`);
				if (m.created) lines.push(`- **Created**: ${m.created}`);
				lines.push("");
			}

			for (const m of relatedMemories) {
				lines.push(`### [RELATED] ${m.id}: ${m.title}`);
				lines.push(`- **Type**: ${m.type || "unknown"} | **Priority**: P${m.priority ?? "?"}`);
				if (m.description) lines.push(`- **Content**: ${m.description}`);
				lines.push("");
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
			};
		},
	});

	// relate: Create an edge between two memory nodes
	api.registerTool({
		name: "relate",
		description:
			"Create a relationship edge between two memory nodes. Use to connect related concepts, causes, or superseding corrections.",
		parameters: {
			type: "object",
			properties: {
				from_id: {
					type: "string",
					description: "Source memory node ID",
				},
				to_id: {
					type: "string",
					description: "Target memory node ID",
				},
				relationship: {
					type: "string",
					enum: ["caused-by", "relates-to", "discovered-from", "supersedes", "validates", "tracks"],
					description:
						"Edge type: caused-by (X because of Y), relates-to (bidirectional association), discovered-from (found while investigating Y), supersedes (X replaces Y), validates (X confirms Y), tracks (X monitors Y)",
				},
			},
			required: ["from_id", "to_id", "relationship"],
		},
		execute: async (_id, params) => {
			const fromId = params.from_id as string;
			const toId = params.to_id as string;
			const relationship = params.relationship as string;

			let result: string;

			switch (relationship) {
				case "relates-to":
					result = runBd(["relate", fromId, toId]);
					break;
				case "supersedes":
					result = runBd(["supersede", toId, "--with", fromId]);
					break;
				default:
					result = runBd(["dep", "add", fromId, toId, "--type", relationship]);
					break;
			}

			if (result.startsWith("bd error:")) {
				return { content: [{ type: "text", text: `Failed to create edge: ${result}` }] };
			}

			const pushResult = pushMemoryToGitHub(`relate: ${fromId} --[${relationship}]--> ${toId}`);
			const pushNote = pushResult !== "pushed" ? ` [${pushResult}]` : "";

			return {
				content: [{
					type: "text",
					text: `Edge created: ${fromId} --[${relationship}]--> ${toId}${pushNote}`,
				}],
			};
		},
	});

	// forget: Archive/close a memory node
	api.registerTool({
		name: "forget",
		description:
			"Archive a memory by closing it. Use when a memory is outdated, incorrect, or superseded. Prefer using 'supersedes' on a new memory over standalone forget.",
		parameters: {
			type: "object",
			properties: {
				memory_id: {
					type: "string",
					description: "ID of the memory to archive",
				},
				reason: {
					type: "string",
					description: "Why this memory is being archived",
				},
				replaced_by: {
					type: "string",
					description: "ID of the memory that replaces this one (optional)",
				},
			},
			required: ["memory_id", "reason"],
		},
		execute: async (_id, params) => {
			const memoryId = params.memory_id as string;
			const reason = params.reason as string;
			const replacedBy = params.replaced_by as string | undefined;

			// Add archival comment
			runBd(["comment", memoryId, `Archived: ${reason}`]);

			// Create supersede edge if replacement provided
			if (replacedBy) {
				runBd(["supersede", memoryId, "--with", replacedBy]);
			}

			// Close the memory
			const closeResult = runBd(["close", memoryId, "--reason", reason]);
			if (closeResult.startsWith("bd error:")) {
				return { content: [{ type: "text", text: `Failed to archive memory: ${closeResult}` }] };
			}

			const pushResult = pushMemoryToGitHub(`forget: ${memoryId} — ${reason}`);
			const pushNote = pushResult !== "pushed" ? ` [${pushResult}]` : "";

			return {
				content: [{
					type: "text",
					text: `Memory archived: ${memoryId}${replacedBy ? ` (replaced by ${replacedBy})` : ""} — ${reason}${pushNote}`,
				}],
			};
		},
	});

	// consolidate: Review, prune, and report on memory health
	api.registerTool({
		name: "consolidate",
		description:
			"Review and maintain the memory graph. Use periodically to prune stale memories, get stats, or review candidates for archival.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["review", "prune-stale", "stats"],
					description:
						"review: show stale/low-priority candidates for archival; prune-stale: auto-close stale P3+ memories; stats: memory graph statistics",
				},
				days_stale: {
					type: "number",
					description: "Number of days without activity to consider stale (default: 30)",
				},
			},
			required: ["action"],
		},
		execute: async (_id, params) => {
			const action = params.action as string;
			const daysStale = (params.days_stale as number) || 30;

			if (action === "stats") {
				const openCount = runBd(["count", "--status", "open"]);
				const closedCount = runBd(["count", "--status", "closed"]);
				const lastConsolidation = runBd(["kv", "get", "memory.last_consolidation"]);
				const version = runBd(["kv", "get", "memory.version"]);

				// Category breakdown
				const categories = ["observation", "decision", "correction", "convention", "outcome"];
				const breakdown: string[] = [];
				for (const cat of categories) {
					const count = runBd(["count", "--label", `memory:${cat}`, "--status", "open"]);
					breakdown.push(`  ${cat}: ${count}`);
				}

				return {
					content: [{
						type: "text",
						text: [
							"## Memory Graph Stats",
							`- **Version**: ${version}`,
							`- **Open memories**: ${openCount}`,
							`- **Closed memories**: ${closedCount}`,
							`- **Last consolidation**: ${lastConsolidation}`,
							"- **By category**:",
							...breakdown,
						].join("\n"),
					}],
				};
			}

			if (action === "review") {
				const staleResult = runBd(["stale", "--days", String(daysStale)]);
				const lowPriority = runBd(["query", "status=open AND priority>=3"]);

				return {
					content: [{
						type: "text",
						text: [
							`## Memory Review (stale > ${daysStale} days)`,
							"### Stale Memories",
							staleResult || "None",
							"### Low Priority (P3+)",
							lowPriority || "None",
							"",
							"Use `forget` to archive any that are no longer relevant.",
						].join("\n"),
					}],
				};
			}

			if (action === "prune-stale") {
				interface StaleIssue {
					id: string;
					title: string;
					priority?: number;
				}

				const staleItems = runBdJson<StaleIssue[]>(["stale", "--days", String(daysStale)]) || [];
				const pruned: string[] = [];

				for (const item of staleItems) {
					if ((item.priority ?? 2) >= 3) {
						runBd(["close", item.id, "--reason", `Auto-pruned: stale ${daysStale}+ days, priority P${item.priority}`]);
						pruned.push(`${item.id}: ${item.title}`);
					}
				}

				// Update consolidation timestamp
				runBd(["kv", "set", "memory.last_consolidation", new Date().toISOString()]);
				const pushResult = pushMemoryToGitHub(`consolidate: pruned ${pruned.length} stale memories`);
				const pushNote = pushResult !== "pushed" ? `\n[${pushResult}]` : "";

				return {
					content: [{
						type: "text",
						text: (pruned.length > 0
							? `Pruned ${pruned.length} stale P3+ memories:\n${pruned.map((p) => `- ${p}`).join("\n")}`
							: `No stale P3+ memories found (checked ${staleItems.length} stale items).`) + pushNote,
					}],
				};
			}

			return {
				content: [{ type: "text", text: `Unknown action: ${action}` }],
			};
		},
	});

	// migrate_knowledge: Import entries from legacy KNOWLEDGE.md
	api.registerTool({
		name: "migrate_knowledge",
		description:
			"Import entries from the legacy KNOWLEDGE.md file into the beads memory graph. Use once to migrate existing knowledge.",
		parameters: {
			type: "object",
			properties: {
				dry_run: {
					type: "boolean",
					description: "If true, show what would be imported without creating memories (default: false)",
				},
			},
		},
		execute: async (_id, params) => {
			const dryRun = (params.dry_run as boolean) || false;
			const knowledgeFile = join(MEMORY_DIR, "KNOWLEDGE.md");

			if (!existsSync(knowledgeFile)) {
				return {
					content: [{
						type: "text",
						text: "No KNOWLEDGE.md found in swanson-db. Nothing to migrate.",
					}],
				};
			}

			const content = readFileSync(knowledgeFile, "utf-8");
			const entryPattern = /### \[(\w+)\] — (\d{4}-\d{2}-\d{2})\n([\s\S]*?)(?=\n### |\n## |$)/g;
			const entries: Array<{ category: string; date: string; text: string }> = [];
			let match: RegExpExecArray | null;

			while ((match = entryPattern.exec(content)) !== null) {
				entries.push({
					category: match[1].toLowerCase(),
					date: match[2],
					text: match[3].trim(),
				});
			}

			if (entries.length === 0) {
				return {
					content: [{
						type: "text",
						text: "No parseable entries found in KNOWLEDGE.md.",
					}],
				};
			}

			if (dryRun) {
				const preview = entries.map((e, i) =>
					`${i + 1}. [${e.category}] (${e.date}) ${e.text.substring(0, 80)}...`
				).join("\n");
				return {
					content: [{
						type: "text",
						text: `Would migrate ${entries.length} entries:\n${preview}`,
					}],
				};
			}

			const results: string[] = [];
			const categoryMap: Record<string, string> = {
				convention: "chore",
				pattern: "task",
				correction: "bug",
				architecture: "task",
			};

			for (const entry of entries) {
				const beadsType = categoryMap[entry.category] || "task";
				const createResult = runBd([
					"create",
					"--title", entry.text.substring(0, 100),
					"--description", entry.text,
					"--type", beadsType,
					"--priority", "2",
					"--labels", `memory:${entry.category},memory:source:migration`,
					"--silent",
				]);

				if (!createResult.startsWith("bd error:")) {
					results.push(`Migrated: [${entry.category}] ${entry.text.substring(0, 60)}...`);
				} else {
					results.push(`Failed: [${entry.category}] ${createResult}`);
				}
			}

			const pushResult = pushMemoryToGitHub(`migrate: ${results.length} entries from KNOWLEDGE.md`);
			const pushNote = pushResult !== "pushed" ? `\n[${pushResult}]` : "";

			return {
				content: [{
					type: "text",
					text: `Migration complete: ${results.length}/${entries.length} entries processed.\n${results.join("\n")}${pushNote}`,
				}],
			};
		},
	});
}
