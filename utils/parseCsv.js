const fs = require("fs");
const { parse } = require("csv-parse/sync");

const { supportedTypes } = require("./parseExcel");
const supportedTypesSet = new Set(supportedTypes);

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
    const type = normalizeType(rowValue(row, "type"));
    const questionText = String(rowValue(row, "questionText") || "").trim();
    const options = parseList(rowValue(row, "options"));
    const correctAnswers = parseList(rowValue(row, "correctAnswers"));
    const mediaURL = String(rowValue(row, "mediaURL") || "").trim();

    if (!type) errors.push("Row " + rowNum + ": type is required.");
    if (type && !supportedTypesSet.has(type)) {
      errors.push('Row ' + rowNum + ': unsupported type "' + type + '".');
    }
    if (!correctAnswers.length) errors.push("Row " + rowNum + ": correctAnswers is required.");
    if (type === "multiple-choice" && options.length < 2) {
      errors.push("Row " + rowNum + ": multiple-choice must have at least 2 options.");
    }
    if ((type === "image" || type === "video" || type === "audio") && !mediaURL) {
      errors.push("Row " + rowNum + ": mediaURL is required for media types.");
    }
    if (!questionText) errors.push("Row " + rowNum + ": questionText is required.");

    questions.push({
      id: "q_" + (index + 1),
      type,
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

