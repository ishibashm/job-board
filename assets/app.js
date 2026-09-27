const state = {
  jobs: [],
  query: "",
  source: "all",
};

const elements = {
  list: document.querySelector("#job-list"),
  status: document.querySelector("#status"),
  resultCount: document.querySelector("#result-count"),
  totalCount: document.querySelector("#total-count"),
  updatedAt: document.querySelector("#updated-at"),
  search: document.querySelector("#search-input"),
  source: document.querySelector("#source-filter"),
  clear: document.querySelector("#clear-filters"),
  template: document.querySelector("#job-card-template"),
};

const sourceLabels = {
  linkedin: "LinkedIn",
  agency: "人材紹介",
  jobboard: "求人サイト",
  direct: "企業採用",
  other: "その他",
};

const icons = {
  location: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  salary: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="m7 4 5 7 5-7M7 12h10M7 16h10M12 11v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日付不明" : dateFormatter.format(date);
}

function appendFact(list, kind, text) {
  if (!text) return;
  const group = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.innerHTML = icons[kind];
  term.title = kind === "location" ? "勤務地" : "給与";
  detail.textContent = text;
  group.append(term, detail);
  list.append(group);
}

function safePublicUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash || /\/messages\//i.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function createCard(job) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const badge = card.querySelector(".source-badge");
  const date = card.querySelector(".job-date");
  const facts = card.querySelector(".job-facts");
  const tags = card.querySelector(".tag-list");
  const action = card.querySelector(".job-card__action");

  badge.textContent = sourceLabels[job.source] || "その他";
  badge.dataset.source = job.source;
  date.textContent = `${formatDate(job.receivedAt)} 受信`;
  date.dateTime = job.receivedAt;
  card.querySelector(".job-company").textContent = job.company;
  card.querySelector(".job-title").textContent = job.title;
  card.querySelector(".job-summary").textContent = job.summary;

  appendFact(facts, "location", job.location);
  appendFact(facts, "salary", job.salary);
  if (!facts.children.length) facts.remove();

  job.tags.forEach((tag) => {
    const item = document.createElement("li");
    item.textContent = tag;
    tags.append(item);
  });

  const publicUrl = safePublicUrl(job.url);
  if (publicUrl) {
    const link = document.createElement("a");
    link.className = "job-link";
    link.href = publicUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${job.title}の募集ページを開く（新しいタブ）`);
    link.innerHTML = "募集を見る <span aria-hidden=\"true\">→</span>";
    action.append(link);
  } else {
    const note = document.createElement("span");
    note.className = "job-unavailable";
    note.textContent = "公開リンクはありません";
    action.append(note);
  }

  return card;
}

function normalizedSearchText(job) {
  return [job.title, job.company, job.location, job.salary, job.summary, ...job.tags]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}

function render() {
  const query = state.query.trim().normalize("NFKC").toLocaleLowerCase("ja");
  const matches = state.jobs.filter((job) => {
    const matchesSource = state.source === "all" || job.source === state.source;
    return matchesSource && (!query || normalizedSearchText(job).includes(query));
  });

  elements.list.replaceChildren();
  const fragment = document.createDocumentFragment();
  matches.forEach((job) => fragment.append(createCard(job)));
  elements.list.append(fragment);
  elements.resultCount.innerHTML = `<strong>${matches.length}</strong> 件の求人`;
  elements.clear.hidden = !state.query && state.source === "all";

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>条件に合う求人がありません</strong>キーワードや掲載元を変えてお試しください。";
    elements.list.append(empty);
  }
}

function buildSourceOptions(jobs) {
  const sources = [...new Set(jobs.map((job) => job.source))];
  sources.sort((a, b) => (sourceLabels[a] || a).localeCompare(sourceLabels[b] || b, "ja"));
  sources.forEach((source) => {
    const option = document.createElement("option");
    const count = jobs.filter((job) => job.source === source).length;
    option.value = source;
    option.textContent = `${sourceLabels[source] || source}（${count}）`;
    elements.source.append(option);
  });
}

async function loadJobs() {
  try {
    const response = await fetch("data/jobs.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.jobs = [...data.jobs].sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    elements.totalCount.textContent = state.jobs.length;
    elements.updatedAt.textContent = formatDate(data.updatedAt);
    buildSourceOptions(state.jobs);
    elements.status.hidden = true;
    render();
  } catch (error) {
    console.error("求人情報を読み込めませんでした", error);
    elements.totalCount.textContent = "0";
    elements.updatedAt.textContent = "取得できませんでした";
    elements.resultCount.textContent = "読み込みエラー";
    elements.status.innerHTML = "求人情報を読み込めませんでした。ローカルではHTTPサーバー経由で開いてください。";
  }
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.source.addEventListener("change", (event) => {
  state.source = event.target.value;
  render();
});

elements.clear.addEventListener("click", () => {
  state.query = "";
  state.source = "all";
  elements.search.value = "";
  elements.source.value = "all";
  elements.search.focus();
  render();
});

loadJobs();
