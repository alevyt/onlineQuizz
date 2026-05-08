const fs = require("fs");
const { parse } = require("csv-parse/sync");

const { supportedAnswerTypes, inferAnswerType, inferMediaKind } = require("./parseExcel");
const supportedAnswerTypesSet = new Set(supportedAnswerTypes);

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
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  return "";
}

function rowValue(row, key) {
  if (!row) return "";
  if (row[key] !== undefined) return row[key];
  const keys = Object.keys(row);
  const lowerKey = String(key).toLowerCase();
  for (let i = 0; i < keys.length; i += 1) {
    if (String(keys[i]).toLowerCase().trim() === lowerKey) return row[keys[i]];
  }
  return "";
}

function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true
  });

  const errors = [];
  const questions = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // header is line 1
    const legacyType = normalizeType(rowValue(row, "type"));
    const explicitAnswerType = normalizeType(rowValue(row, "answerType"));
    const questionText = String(rowValue(row, "questionText") || "").trim();
    const options = parseList(rowValue(row, "options"));
    const correctAnswers = parseList(rowValue(row, "correctAnswers"));
    const mediaURL = String(rowValue(row, "mediaURL") || "").trim();
    const answerType = explicitAnswerType || inferAnswerType(options, legacyType);
    const explicitMediaKind = normalizeMediaKind(rowValue(row, "mediaKind"));
    const inferredMediaKind = inferMediaKind(mediaURL);
    const mediaKind = explicitMediaKind || inferredMediaKind || (legacyType === "image" || legacyType === "video" || legacyType === "audio" ? legacyType : "");

    if (!answerType) errors.push("Row " + rowNum + ": failed to infer answerType.");
    if (answerType && !supportedAnswerTypesSet.has(answerType)) {
      errors.push('Row ' + rowNum + ': unsupported answerType "' + answerType + '".');
    }
    if (!correctAnswers.length) errors.push("Row " + rowNum + ": correctAnswers is required.");
    if ((answerType === "multiple-choice" || answerType === "true-false") && options.length < 2) {
      errors.push("Row " + rowNum + ": multiple-choice/true-false must have at least 2 options.");
    }
    if (answerType === "true-false" && options.length !== 2) {
      errors.push("Row " + rowNum + ": true-false must have exactly 2 options.");
    }
    if (explicitMediaKind && !mediaURL) {
      errors.push("Row " + rowNum + ": mediaURL is required when mediaKind is set.");
    }
    if (mediaURL && !mediaKind) {
      errors.push("Row " + rowNum + ": cannot determine mediaKind from mediaURL. Provide mediaKind.");
    }
    if (!questionText) errors.push("Row " + rowNum + ": questionText is required.");

    questions.push({
      id: "q_" + (index + 1),
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
  parseCsvFile
};

