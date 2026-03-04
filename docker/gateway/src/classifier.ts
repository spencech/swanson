import Anthropic from "@anthropic-ai/sdk";
import { ClassificationResult, EXPERTS } from "./types";

const CLASSIFIER_PROMPT = `You route user messages to the right Upbeat platform expert.

Experts:
- ron: Code architecture, features, patterns, implementation plans, spawnee templates
- ben: SQL queries, analytics, data reports, exports, database schema
- leslie: Education research, coaching strategies, toolkit resources, engagement categories
- tom: Sales pipeline, CRM data, prospects, customers, marketing
- ann: BI dashboards, engagement trends, cross-domain data analysis, metrics
- april: Infrastructure, deployments, DevOps, monitoring, CI/CD, operations

Respond with JSON only: {"expert":"name","confidence":0.0-1.0,"reason":"brief"}`;

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
			max_tokens: 100,
			messages: [
				{ role: "user", content: message },
			],
			system: CLASSIFIER_PROMPT,
		});

		const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
		console.log(`[classifier] Raw LLM response: ${JSON.stringify(rawText)}`);
		// Strip code fences and extract JSON — Haiku often wraps in ```json ... ```
		const stripped = rawText.replace(/```(?:json)?\s*/gi, "").trim();
		const jsonMatch = stripped.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error(`No JSON object found in classifier response: ${rawText.slice(0, 200)}`);
		const parsed = JSON.parse(jsonMatch[0]);

		// Validate expert name
		if (!EXPERTS.includes(parsed.expert)) {
			console.warn(`[classifier] Unknown expert "${parsed.expert}", defaulting to ron`);
			return { expert: "ron", confidence: 0.5, reason: "Unknown expert returned, defaulting to ron" };
		}

		// Apply confidence threshold
		if (parsed.confidence < 0.6) {
			console.log(`[classifier] Low confidence ${parsed.confidence} for "${parsed.expert}", defaulting to ron`);
			return { expert: "ron", confidence: parsed.confidence, reason: `Low confidence, defaulting to ron. Original: ${parsed.reason}` };
		}

		return {
			expert: parsed.expert,
			confidence: parsed.confidence,
			reason: parsed.reason,
		};
	} catch (err) {
		console.error("[classifier] Classification failed, defaulting to ron:", err);
		return { expert: "ron", confidence: 0.0, reason: "Classification error, defaulting to ron" };
	}
}
