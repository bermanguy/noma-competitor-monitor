# 0013. Competitors' AWS Marketplace list prices are not watched for now

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread: "sounds like we can skip this as it doesnt bring real value"

## Context

[0005](0005-pricing-page-type.md) and the seed said that none of the competitors publishes pricing. Guy questioned that, so each competitor's site and its AWS Marketplace listings were checked on 2026-11-12.

None of them has a pricing page on its own site. Every site offers only a demo, a contact form or a free assessment (no free plan, no tiers). Three of them, and HiddenLayer (the substitute in [0001](0001-competitors-to-monitor.md)), do show list prices on AWS Marketplace:

| Competitor | AWS Marketplace list price (12-month contract) |
| --- | --- |
| Zenity | Listed earlier ([announcement](https://www.zenity.io/company-overview/newsroom/company-news/zenity-now-available-on-aws-marketplace)), but the listing link now opens the generic store page, so it looks private or removed |
| Pillar Security | [$175,000](https://aws.amazon.com/marketplace/pp/prodview-xphnsjsox7vjw), "scales with the number of Units" |
| Lasso Security | Gateway for LLMs: [$50,000 plus $0.01 per unit over the commit](https://aws.amazon.com/marketplace/pp/prodview-noabqkrq6zbq4). For Employees: [$20,000](https://aws.amazon.com/marketplace/pp/prodview-4ey26i3k5epmi) |
| Straiker | [$100,000](https://aws.amazon.com/marketplace/pp/prodview-qjnfubrnnzndw), "Platform access" |
| HiddenLayer | [$5,000,000](https://aws.amazon.com/marketplace/pp/prodview-2haypjrayfxgw), almost certainly a placeholder |

Every listing also offers a private offer, so a deal is quoted separately.

## Decision

Do not add the Marketplace listings as watched pricing pages for now. The seed and the pricing page type stay as they are, and the pricing demo keeps using the canary page.

## Why

- **The numbers are not what customers pay.** They are starting prices for a single unit on a 12-month contract, and deals close on private offers. HiddenLayer's $5M shows that a listing price can be a placeholder.
- **They rarely change.** A watched page that never changes adds cost and an empty line in every run, but no news for Product or Marketing.
- **They are not the competitor's own message.** The teams care about how a competitor presents itself to buyers, and the competitors keep pricing off their own sites.
- **Marketplace pages rely on JavaScript.** Reading them reliably would need checking from the deployed service, which is work for little value in the MVP.

## Alternatives considered

- **Watch the four live listings as pricing pages.** A new product line or a changed list price would be a real signal, and it would give the demo a real pricing source. Left out for the reasons above.
- **Record the list prices once, as background for the teams.** Kept here in the table instead, so nothing in the product depends on them.

## Revisit when

- A competitor adds a pricing page to its own site. It is then added on the operator page as a pricing page (see 0005).
- The teams ask for list-price moves or new Marketplace products.
