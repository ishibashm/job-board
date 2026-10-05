# Job Board Public Site (from Gmail job emails)

## Goal
Static public webpage listing job opportunities scraped from the user's Gmail.
Updated daily by an automation that refreshes `data/jobs.json`.

## Constraints
- Public page: NO private email addresses, NO full email bodies, NO personal notes, NO phone numbers.
- Only publish fields safe for public: title, company/agency, location, employment type, salary if public, source label (e.g. "LinkedIn", "Agency"), posted/received date, public apply URL, short summary.
- Japanese UI primary; English OK in content when original is English.
- Works as GitHub Pages (or any static host): pure HTML/CSS/JS or minimal build.
- Mobile-friendly, fast, searchable/filterable.

## Data contract: `data/jobs.json`
```json
{
  "updatedAt": "2026-09-23T12:00:00+09:00",
  "jobs": [
    {
      "id": "stable-unique-id",
      "title": "職種名",
      "company": "会社または紹介元",
      "source": "linkedin|indeed|agency|jobboard|direct|other",
      "location": "勤務地 or リモート",
      "salary": "記載があれば",
      "summary": "1〜2文の要約（個人情報なし）",
      "url": "https://public-apply-or-listing-url",
      "receivedAt": "2026-09-20T10:00:00+09:00",
      "tags": ["ServiceNow", "DB"]
    }
  ]
}
```

## Deliverables
1. `index.html` (+ CSS/JS as needed) that loads `data/jobs.json` and renders a clean list with search + filter by source.
2. `data/jobs.json` with 3–5 realistic placeholder jobs matching the schema (mark clearly as sample).
3. `README.md` in Japanese: how to open locally, how daily update should overwrite `data/jobs.json`, privacy rules.
4. Optional simple `scripts/validate-jobs.mjs` to validate JSON schema lightly.

Do not invent a backend. Static only.

## Indeed title filter (monorepo-only)
Indeed jobs are filtered in the private monorepo via `config/job-filters.json` and `scripts/merge-jobs.mjs` (IT / engineer / DB titles). Those files stay monorepo-only and are never staged for the public mirror; only the filtered `data/jobs.json` is published.
