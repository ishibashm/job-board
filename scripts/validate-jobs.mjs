import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data", "jobs.json");
const errors = [];
const allowedSources = new Set(["linkedin", "indeed", "agency", "jobboard", "direct", "other"]);
const requiredFields = ["id", "title", "company", "source", "location", "salary", "summary", "url", "receivedAt", "tags"];
const stringFields = requiredFields.filter((field) => field !== "tags");

function fail(scope, message) {
  errors.push(`${scope}: ${message}`);
}

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function validatePublicUrl(value, scope) {
  if (value === "") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(scope, "url は有効な絶対URLまたは空文字にしてください");
    return;
  }

  if (url.protocol !== "https:") fail(scope, "url は https のみ使用できます");
  if (url.username || url.password) fail(scope, "url に認証情報を含められません");
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    fail(scope, "url のパス形式が不正です");
    return;
  }
  if (/\/messages(?:\/|$)/i.test(decodedPath)) fail(scope, "非公開メッセージURLは使用できません");

  const hostname = url.hostname.toLowerCase();
  const isIndeedHost = hostname === "indeed.com" || hostname.endsWith(".indeed.com")
    || hostname === "indeed.jp" || hostname.endsWith(".indeed.jp");
  const isBizReachHost = hostname === "bizreach.jp" || hostname.endsWith(".bizreach.jp");

  if (hostname === "www.linkedin.com") {
    if (url.search || url.hash || !/^\/jobs\/view\/\d+\/?$/.test(url.pathname)) {
      fail(scope, "LinkedIn URL は公開求人ページ形式ではありません");
    }
  } else if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    fail(scope, "LinkedIn URL は正規化された公開求人ページ形式ではありません");
  } else if (isIndeedHost) {
    const entries = [...url.searchParams.entries()];
    if (url.protocol !== "https:" || hostname !== "jp.indeed.com" || url.pathname !== "/viewjob"
      || url.hash || entries.length !== 1 || entries[0][0] !== "jk" || !/^[a-f0-9]{16}$/.test(entries[0][1])) {
      fail(scope, "Indeed URL は正規化された公開求人ページ形式ではありません");
    }
  } else {
    if (url.search || url.hash) fail(scope, "url にクエリ文字列やフラグメントを含められません");
    if (isBizReachHost
      && (hostname !== "www.bizreach.jp" || !/^\/job-feed\/public-advertising\/[a-z0-9_-]+\/$/i.test(url.pathname))) {
      fail(scope, "BizReach URL は公開求人ページ形式ではありません");
    }
    if (/(?:unsubscribe|opt-?out|\/click|\/track)/i.test(decodedPath)) fail(scope, "メール追跡・配信停止用URLは使用できません");
  }
}

function validatePrivacy(job, scope, denyTerms) {
  const text = [job.title, job.company, job.location, job.salary, job.summary, job.url, ...(job.tags || [])].join(" ");
  const forbidden = [
    [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i, "メールアドレス"],
    [/(?:midToken|otpToken|trackingId|trk=|tmtk|alid=|utm_)/i, "認証・追跡トークン"],
    [/(?<![A-Za-z0-9])(?:\+?81[-\s]?(?:0)?|0)\d{1,4}[-ー－\s]?\d{1,4}[-ー－\s]?\d{3,4}(?![A-Za-z0-9])/, "電話番号らしき文字列"],
    [/[\p{L}\p{N}]{0,29}(?<![仕同多模異一態各有文])\s*様(?![式々相子態])|[\p{L}\p{N}]{1,30}\s*さんへ/u, "個人宛ての敬称を含む文言"],
    [/(?:障害者|障がい|障碍|療育|就労移行|就労継続|[AaＡａ]\s*型事業所|disability|di-agent)/i, "センシティブな個人属性に関する文言"],
    [/(?:勤怠|タイムカード|給与明細|立替金|精算|契約更新|就業条件|教育訓練|年金|ストレスチェック|通勤交通費|源泉徴収)/i, "雇用管理上の個人通知"],
    [/\/messages\//i, "非公開メッセージURL"],
  ];

  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) fail(scope, `${label}が含まれています`);
  }
  const folded = text.normalize("NFKC").toLocaleLowerCase("ja");
  if (denyTerms.some((term) => folded.includes(term))) fail(scope, "deny-term match");
}

let denyTerms = [];
if (process.env.JOB_BOARD_DENY_TERMS_FILE) {
  try {
    denyTerms = (await readFile(process.env.JOB_BOARD_DENY_TERMS_FILE, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.normalize("NFKC").toLocaleLowerCase("ja"));
  } catch {
    console.error("NG: 追加の禁止語ファイルを読み込めません");
    process.exit(1);
  }
}

let data;
try {
  data = JSON.parse(await readFile(dataPath, "utf8"));
} catch (error) {
  console.error(`NG: ${dataPath} を読み込めません: ${error.message}`);
  process.exit(1);
}

if (!data || typeof data !== "object" || Array.isArray(data)) {
  fail("root", "ルートはオブジェクトである必要があります");
} else {
  if (!isValidDate(data.updatedAt)) fail("root", "updatedAt は有効な日時である必要があります");
  if (!Array.isArray(data.jobs)) fail("root", "jobs は配列である必要があります");
}

const ids = new Set();
if (Array.isArray(data?.jobs)) {
  data.jobs.forEach((job, index) => {
    const scope = `jobs[${index}]`;
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      fail(scope, "求人はオブジェクトである必要があります");
      return;
    }

    const keys = Object.keys(job);
    for (const field of requiredFields) {
      if (!Object.hasOwn(job, field)) fail(scope, `${field} がありません`);
    }
    for (const key of keys) {
      if (!requiredFields.includes(key)) fail(scope, `未定義のフィールド ${key} があります`);
    }
    for (const field of stringFields) {
      if (typeof job[field] !== "string") fail(scope, `${field} は文字列である必要があります`);
    }

    if (typeof job.id === "string") {
      if (!/^[a-z0-9][a-z0-9-]{4,79}$/.test(job.id)) fail(scope, "id の形式が不正です");
      if (ids.has(job.id)) fail(scope, `id ${job.id} が重複しています`);
      ids.add(job.id);
    }
    if (typeof job.title === "string" && !job.title.trim()) fail(scope, "title は空にできません");
    if (typeof job.company === "string" && !job.company.trim()) fail(scope, "company は空にできません");
    if (typeof job.summary === "string" && !job.summary.trim()) fail(scope, "summary は空にできません");
    if (!allowedSources.has(job.source)) fail(scope, `source ${JSON.stringify(job.source)} は許可されていません`);
    if (!isValidDate(job.receivedAt)) fail(scope, "receivedAt は有効な日時である必要があります");
    if (!Array.isArray(job.tags) || job.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
      fail(scope, "tags は空でない文字列の配列である必要があります");
    }

    validatePublicUrl(job.url, scope);
    validatePrivacy(job, scope, denyTerms);
  });
}

if (errors.length) {
  console.error(`NG: ${errors.length} 件の問題が見つかりました`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`OK: ${data.jobs.length} 件の求人を検証しました（スキーマ・URL・プライバシー）`);
