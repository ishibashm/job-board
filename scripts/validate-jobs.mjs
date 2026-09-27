import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "jobs.json");
const errors = [];
const allowedSources = new Set(["linkedin", "agency", "jobboard", "direct", "other"]);
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
  if (url.search || url.hash) fail(scope, "url にクエリ文字列やフラグメントを含められません");
  if (/\/messages(?:\/|$)/i.test(url.pathname)) fail(scope, "非公開メッセージURLは使用できません");

  if (url.hostname === "www.linkedin.com" && !/^\/jobs\/view\/\d+\/?$/.test(url.pathname)) {
    fail(scope, "LinkedIn URL は公開求人ページ形式ではありません");
  }
}

function validatePrivacy(job, scope) {
  const text = Object.values(job).flat().join(" ");
  const forbidden = [
    [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i, "メールアドレス"],
    [/(?:midToken|otpToken|trackingId|trk=)/i, "認証・追跡トークン"],
    [/\b(?:0\d{1,4}[-ー－ ]?\d{1,4}[-ー－ ]?\d{3,4})\b/, "電話番号らしき文字列"],
    [/[\p{L}\p{N}]+\s*様/u, "個人宛ての敬称を含む文言"],
    [/(?:障害者|障がい者|disability)/i, "センシティブな個人属性に関する文言"],
    [/\/messages\//i, "非公開メッセージURL"],
  ];

  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) fail(scope, `${label}が含まれています`);
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
    validatePrivacy(job, scope);
  });
}

if (errors.length) {
  console.error(`NG: ${errors.length} 件の問題が見つかりました`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`OK: ${data.jobs.length} 件の求人を検証しました（スキーマ・URL・プライバシー）`);
