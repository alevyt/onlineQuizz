const XLSX = require("xlsx");

const supportedTypes = new Set([
  "multiple-choice",
  "short-answer",
  "true-false",
  "image",
  "video",
  "audio"
]);

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

function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const errors = [];
  const questions = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const type = normalizeType(row.type);
    const questionText = String(row.questionText || "").trim();
    const options = parseList(row.options);
    const correctAnswers = parseList(row.correctAnswers);
    const mediaURL = String(row.mediaURL || "").trim();

    if (!type) errors.push(`Row ${rowNum}: type is required.`);
    if (!supportedTypes.has(type)) errors.push(`Row ${rowNum}: unsupported type "${type}".`);
    if (!correctAnswers.length) errors.push(`Row ${rowNum}: correctAnswers is required.`);
    if (type === "multiple-choice" && options.length < 2) {
      errors.push(`Row ${rowNum}: multiple-choice must have at least 2 options.`);
    }
    if ((type === "image" || type === "video" || type === "audio") && !mediaURL) {
      errors.push(`Row ${rowNum}: mediaURL is required for media types.`);
    }
    if (!questionText) {
      errors.push(`Row ${rowNum}: questionText is required.`);
    }

    questions.push({
      id: `q_${index + 1}`,
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
  parseExcelFile,
  supportedTypes: Array.from(supportedTypes)
};
