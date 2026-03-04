import Anthropic from "@anthropic-ai/sdk";
import { ClassificationResult, EXPERTS } from "./types";

const CLASSIFIER_PROMPT = `Route the message to one Upbeat platform expert. Reply with ONLY a JSON object, no markdown.

- ron: Codebase, architecture, features, implementation, spawnee templates
- ben: SQL queries, database schema, data exports, raw data pulls
- leslie: Education research, coaching strategies, teacher retention literature, toolkit resources
- tom: Sales pipeline, NEW prospects, lead generation, marketing campaigns
- ann: Engagement scores, survey results, district/contract analytics, trends, dashboards, cross-domain analysis
- april: Infrastructure, Docker, deployments, DevOps, CI/CD, monitoring

Context: "contracts" and "districts" refer to school district accounts with engagement data (ann), NOT sales leads (tom). Questions about engagement scores, survey results, or research insights go to ann or leslie, not tom.

{"expert":"name","confidence":0.0-1.0,"reason":"5 words max"}`;

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

		let parsed: { expert?: string; confidence?: number; reason?: string };
		if (jsonMatch) {
			parsed = JSON.parse(jsonMatch[0]);
		} else {
			// Fallback: extract expert name from truncated JSON (max_tokens cutoff)
			const expertMatch = stripped.match(/"expert"\s*:\s*"(\w+)"/);
			const confMatch = stripped.match(/"confidence"\s*:\s*([\d.]+)/);
			if (expertMatch) {
				console.log(`[classifier] Recovered expert from truncated JSON: ${expertMatch[1]}`);
				parsed = { expert: expertMatch[1], confidence: confMatch ? parseFloat(confMatch[1]) : 0.7, reason: "recovered from truncated response" };
			} else {
				throw new Error(`No JSON object found in classifier response: ${rawText.slice(0, 200)}`);
			}
		}

		const expert = parsed.expert || "ron";
		const confidence = parsed.confidence ?? 0;
		const reason = parsed.reason || "no reason provided";

		// Validate expert name
		if (!EXPERTS.includes(expert as typeof EXPERTS[number])) {
			console.warn(`[classifier] Unknown expert "${expert}", defaulting to ron`);
			return { expert: "ron", confidence: 0.5, reason: "Unknown expert returned, defaulting to ron" };
		}

		// Apply confidence threshold
		if (confidence < 0.6) {
			console.log(`[classifier] Low confidence ${confidence} for "${expert}", defaulting to ron`);
			return { expert: "ron", confidence, reason: `Low confidence, defaulting to ron. Original: ${reason}` };
		}

		return { expert, confidence, reason };
	} catch (err) {
		console.error("[classifier] Classification failed, defaulting to ron:", err);
		return { expert: "ron", confidence: 0.0, reason: "Classification error, defaulting to ron" };
	}
}
