# 0010. Until submission, trust comes before experience

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread

## Context

With three days left, the work could go to two places. One is the experience: nicer owner and operator screens, smoother editing, a friendlier Slack layout. The other is trust: making sure the system finds every real update, judges each one per team at the right level, and stays quiet otherwise.

## Decision

Until submission, effort goes to trust:

- **Monitoring:** every source checked on schedule, failures and empty sources visible to the operator.
- **Judgment:** per-team levels measured on the golden set (precision, recall, severe misses), each change checked against the baseline.
- **Noise:** nothing sent without an exact quote, repeated stories linked rather than sent twice, digests that fit in Slack.

The experience stays at "clear and working". Polish waits.

## Why

- A monitor that is noisy or misses things gets muted, however nice it looks. Once a team stops trusting the alerts, a better screen does not bring them back.
- Trust can be measured with the exam. Experience is harder to judge in three days without real users.
- The brief asks for a system that runs unattended and is right. It does not ask for a polished interface.

## Deferred, in order

1. Run the exam automatically when an owner saves a team description, and show before and after.
2. A "we missed this" button, so missed updates become golden items.
3. Model-assisted sorting of exam disagreements into the five buckets.
4. Owner and operator screen polish: layout, wording, mobile.
5. Slack interactive buttons in place of feedback links.

## Consequences

- The screens are plain. The demo shows what they do, not how they look.
- After submission, the first item above comes first, because it makes the owner's tuning loop faster.
