const XLSX = require("xlsx");

const supportedAnswerTypes = new Set(["multiple-choice", "short-answer", "true-false"]);
const supportedMediaKinds = new Set(["image", "video", "audio"]);

function parseList(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeType(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMediaKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return supportedMediaKinds.has(kind) ? kind : "";
}

function inferMediaKind(mediaURL) {
  const url = String(mediaURL || "").trim().toLowerCase();
  if (!url) return "";
  const base = url.split("?")[0].split("#")[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(base)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(base)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(base)) return "audio";
  return "";
}

function inferAnswerType(options, legacyType) {
  if (supportedAnswerTypes.has(legacyType)) return legacyType;
  if (!options.length) return "short-answer";
  if (options.length === 2) {
    const lower = options.map((v) => String(v).trim().toLowerCase());
    const boolValues = new Set(["true", "false", "yes", "no", "так", "ні"]);
    if (boolValues.has(lower[0]) && boolValues.has(lower[1])) {
      return "true-false";
    }
  }
  return "multiple-choice";
}

function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const errors = [];
  const questions = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const legacyType = normalizeType(row.type);
    const explicitAnswerType = normalizeType(row.answerType);
    const questionText = String(row.questionText || "").trim();
    const options = parseList(row.options);
    const correctAnswers = parseList(row.correctAnswers);
    const mediaURL = String(row.mediaURL || "").trim();
    const answerType = explicitAnswerType || inferAnswerType(options, legacyType);
    const explicitMediaKind = normalizeMediaKind(row.mediaKind);
    const inferredMediaKind = inferMediaKind(mediaURL);
    const mediaKind = explicitMediaKind || inferredMediaKind || (supportedMediaKinds.has(legacyType) ? legacyType : "");

    if (!answerType) errors.push(`Row ${rowNum}: failed to infer answerType.`);
    if (!supportedAnswerTypes.has(answerType)) errors.push(`Row ${rowNum}: unsupported answerType "${answerType}".`);
    if (!correctAnswers.length) errors.push(`Row ${rowNum}: correctAnswers is required.`);
    if ((answerType === "multiple-choice" || answerType === "true-false") && options.length < 2) {
      errors.push(`Row ${rowNum}: multiple-choice/true-false must have at least 2 options.`);
    }
    if (answerType === "true-false" && options.length !== 2) {
      errors.push(`Row ${rowNum}: true-false must have exactly 2 options.`);
    }
    if (explicitMediaKind && !mediaURL) {
      errors.push(`Row ${rowNum}: mediaURL is required when mediaKind is set.`);
    }
    if (mediaURL && !mediaKind) {
      errors.push(`Row ${rowNum}: cannot determine mediaKind from mediaURL. Provide mediaKind.`);
    }
    if (!questionText) {
      errors.push(`Row ${rowNum}: questionText is required.`);
    }

    questions.push({
      id: `q_${index + 1}`,
      type: answerType,
      answerType,
      mediaKind,
      questionText,
      options,
      correctAnswers,
      mediaURL
    });
  });

  return { errors, questions };
}

module.exports = {
  parseExcelFile,
  supportedAnswerTypes: Array.from(supportedAnswerTypes),
  supportedMediaKinds: Array.from(supportedMediaKinds),
  inferAnswerType,
  inferMediaKind
};
