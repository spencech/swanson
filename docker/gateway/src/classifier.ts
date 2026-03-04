import Anthropic from "@anthropic-ai/sdk";
import { ClassificationResult, EXPERTS } from "./types";

const CLASSIFIER_PROMPT = `Route the message to Upbeat platform experts. Reply with ONLY a JSON object, no markdown.

Experts:
- ron: Codebase, architecture, features, implementation, spawnee templates
- ben: SQL queries, database schema, data exports, raw data pulls
- leslie: Education research, coaching strategies, teacher retention literature, toolkit resources
- tom: Sales pipeline, NEW prospects, lead generation, marketing campaigns
- ann: Engagement scores, survey results, district/contract analytics, trends, dashboards, cross-domain analysis
- april: Infrastructure, Docker, deployments, DevOps, CI/CD, monitoring

Context: "contracts" and "districts" refer to school district accounts with engagement data (ann), NOT sales leads (tom). Questions about engagement scores, survey results, or research insights go to ann or leslie, not tom.

Rules:
- "primary": the ONE best-matching expert
- "supporting": experts whose domains are ALSO needed (0-2 max, only when clearly multi-domain)
- "focus": object mapping each involved expert to a 1-sentence directive scoping their work
- Most questions need only the primary — leave supporting empty unless genuinely multi-domain

{"primary":"name","supporting":[],"focus":{"name":"directive"},"confidence":0.0-1.0,"reason":"5 words max"}`;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
	if (!anthropicClient) {
		anthropicClient = new Anthropic();
	}
	return anthropicClient;
}

export async function classify(message: string): Promise<ClassificationResult> {
	try {
		const client = getClient();
		const response = await client.messages.create({
			model: "claude-haiku-4-5-20251001",
			max_tokens: 256,
			messages: [
				{ role: "user", content: message },
			],
			system: CLASSIFIER_PROMPT,
		});

		const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
		console.log(`[classifier] Raw LLM response: ${JSON.stringify(rawText)}`);
		// Strip code fences and extract JSON — Haiku sometimes wraps in ```json ... ```
		const stripped = rawText.replace(/```(?:json)?\s*/gi, "").trim();
		const jsonMatch = stripped.match(/\{[\s\S]*\}/);

		let parsed: { primary?: string; expert?: string; supporting?: string[]; focus?: Record<string, string>; confidence?: number; reason?: string };
		if (jsonMatch) {
			parsed = JSON.parse(jsonMatch[0]);
		} else {
			// Fallback: extract primary name from truncated JSON (max_tokens cutoff)
			const primaryMatch = stripped.match(/"primary"\s*:\s*"(\w+)"/) || stripped.match(/"expert"\s*:\s*"(\w+)"/);
			const confMatch = stripped.match(/"confidence"\s*:\s*([\d.]+)/);
			if (primaryMatch) {
				console.log(`[classifier] Recovered primary from truncated JSON: ${primaryMatch[1]}`);
				parsed = { primary: primaryMatch[1], confidence: confMatch ? parseFloat(confMatch[1]) : 0.7, reason: "recovered from truncated response" };
			} else {
				throw new Error(`No JSON object found in classifier response: ${rawText.slice(0, 200)}`);
			}
		}

		// Support legacy "expert" field as fallback for "primary"
		const primary = parsed.primary || parsed.expert || "ron";
		const confidence = parsed.confidence ?? 0;
		const reason = parsed.reason || "no reason provided";

		// Validate primary expert name
		if (!EXPERTS.includes(primary as typeof EXPERTS[number])) {
			console.warn(`[classifier] Unknown expert "${primary}", defaulting to ron`);
			return { primary: "ron", supporting: [], focus: {}, confidence: 0.5, reason: "Unknown expert returned, defaulting to ron" };
		}

		// Apply confidence threshold
		if (confidence < 0.6) {
			console.log(`[classifier] Low confidence ${confidence} for "${primary}", defaulting to ron`);
			return { primary: "ron", supporting: [], focus: {}, confidence, reason: `Low confidence, defaulting to ron. Original: ${reason}` };
		}

		// Validate and filter supporting list
		let supporting = parsed.supporting || [];
		supporting = supporting
			.filter(s => EXPERTS.includes(s as typeof EXPERTS[number]))
			.filter(s => s !== primary)
			.slice(0, 2);

		// Build focus map, defaulting to empty if missing
		const focus = parsed.focus || {};

		return { primary, supporting, focus, confidence, reason };
	} catch (err) {
		console.error("[classifier] Classification failed, defaulting to ron:", err);
		return { primary: "ron", supporting: [], focus: {}, confidence: 0.0, reason: "Classification error, defaulting to ron" };
	}
}
