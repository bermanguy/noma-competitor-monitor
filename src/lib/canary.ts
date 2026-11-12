/** Starting text of the canary page; the operator edits it from /ops. */
export const DEFAULT_CANARY = `Canary Security — test page for the competitor monitor
The AI security platform for enterprise agents.
Discover every AI agent, model and MCP server across your organisation.
Assess risk with continuous red teaming.
Protect agents at runtime with inline guardrails.
Trusted by security teams at global enterprises.`;

/**
 * Starting content of the pricing canary page, one plan per line:
 * Plan | monthly price | yearly price | feature; feature; ...
 */
export const DEFAULT_CANARY_PRICING = `Starter | $29 | $24 | Up to 10 AI agents; Agent inventory; Email support
Team | $79 | $66 | Up to 100 AI agents; Runtime guardrails; MCP server discovery; Slack support
Enterprise | Contact sales | Contact sales | Unlimited AI agents; SSO and SCIM; Dedicated success manager`;

export interface CanaryPlan { name: string; monthly: string; yearly: string; features: string[] }

export function parseCanaryPricing(text: string): CanaryPlan[] {
  return text.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0])
    .map(([name, monthly, yearly, features]) => ({
      name: name!, monthly: monthly || "Contact sales", yearly: yearly || "Contact sales",
      features: (features ?? "").split(";").map((f) => f.trim()).filter(Boolean),
    }));
}
