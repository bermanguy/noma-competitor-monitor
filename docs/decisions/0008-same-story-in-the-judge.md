# 0008. The judge recognises a story it has already seen

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), on a decision card

## Context

Zenity published the AgentCorruption research twice: a Labs post and a press release. Each item was judged on its own, so both could be sent as alerts, and the digest listed them as two unrelated posts.

## Decision

- Before judging, the judge gets the same competitor's judged items from the last 21 days (title, one-line summary, level per team).
- It returns `sameStoryAs` (the id of the earlier item, or null) and `whatsNew`. An id it was not shown is dropped.
- A team that already got the story gets `log`, unless the new item adds something that matters to that team.
- Slack: a follow-up says "Follow-up to <earlier post>. New: …". The digest groups the posts of one story into one entry.
- The golden set gets items with an `earlier` list to test this (first: the press release after the Labs post, expected `log` for every team).

## Why

- The model already reads the item; comparing it with a short list of summaries costs a few hundred tokens and no new infrastructure.
- It catches repeats that share no words with the original, which a title or URL match would miss.

## Alternatives considered

- Embeddings and clustering across all sources: better at scale, but needs a vector store and a threshold to tune. Kept for later (see "How it grows").
- A rule on titles or URLs: cheap, but misses a press release and a blog post about the same research.

## Consequences

- Only the same competitor is checked. The same news from two competitors (a joint announcement) is not linked.
- The judge prompt is now judge-v4; the exam baseline should be saved after this change.
