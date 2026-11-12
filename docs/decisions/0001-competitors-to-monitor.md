# 0001. Competitors to monitor in the MVP

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12

## Decision

Monitor four independent AI-agent-security vendors whose offering overlaps most with Noma's (agent discovery and posture, red teaming, runtime enforcement):

| Competitor | Why it's in | Expected value per team |
| --- | --- | --- |
| [Zenity](https://zenity.io/blog) | Closest head-to-head in AI agent governance; publishes monthly product-update posts ([example](https://zenity.io/blog/august-2026-product-updates)) and announcement categories | Product: steady capability changes. Marketing: category claims ([Gartner "company to beat"](https://zenity.io/blog/company-to-beat)) |
| [Pillar Security](https://www.pillar.security/blog) | Full-lifecycle agent security; publishes buyer guides that rank competitors, including Noma ([guide](https://www.pillar.security/blog/best-agentic-ai-security-platforms-enterprise-2026)) | Marketing: how they frame the category and position against Noma |
| [Lasso Security](https://www.lasso.security/blog) | Runtime security, endpoint and coding-agent and MCP governance ([post](https://www.lasso.security/blog/securing-ai-on-endpoints-how-to-govern-ai-tools-coding-agents-and-mcp-connections)); named by the owner | Product and R&D: coverage moves into endpoints and MCP |
| [Straiker](https://www.straiker.ai/blog) | Agent red teaming plus runtime defence; separate [research](https://www.straiker.ai/research) section | R&D: attack techniques and how they detect them |

Each competitor also gets one watched page (homepage or main product page) for quiet messaging and offering changes. A canary page we control is added for end-to-end verification and the demo.

## Considered and left out

- **Acquired vendors** (Prompt Security to SentinelOne, Lakera to Check Point, Protect AI to Palo Alto Networks, Aim to Cato Networks; [source](https://www.govinfosecurity.com/blogs/ai-security-goes-mainstream-as-vendors-spend-heavily-on-ma-p-3953)). Their news now flows through large parent sites, where nearly everything is unrelated noise.
- **Platform incumbents** (Palo Alto Prisma AIRS, Cisco AI Defense, Microsoft, CrowdStrike, Zscaler). Real competitors, but their blogs are high-volume and mostly off-topic. A good scale test after the MVP, not a first source.
- **HiddenLayer.** Strong research output ([innovation hub](https://hiddenlayer.com/innovation-hub/insights)) but more model-security than agent-security. First substitute if one of the four turns out unusable.

## Open

- Source-type mix (RSS present or not, JS-rendered or not) is checked in the fetch spike. The build container's network policy blocks these sites, so the spike runs from the deployed service or after the policy is widened.
- Adding a fifth competitor live in the UI is part of the demo; HiddenLayer is the candidate.
