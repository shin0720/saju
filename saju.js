const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

const STEM_ELEMENT = {
  갑: "Wood", 을: "Wood",
  병: "Fire", 정: "Fire",
  무: "Earth", 기: "Earth",
  경: "Metal", 신: "Metal",
  임: "Water", 계: "Water"
};

const BRANCH_ELEMENT = {
  자: "Water", 축: "Earth", 인: "Wood", 묘: "Wood", 진: "Earth", 사: "Fire",
  오: "Fire", 미: "Earth", 신: "Metal", 유: "Metal", 술: "Earth", 해: "Water"
};

const GENDER_TEXT = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Not provided"
};

function parseDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3])
  };
}

function parseTime(timeStr) {
  if (timeStr === "unknown") return { hour: 12, minute: 0, unknown: true };
  const m = /^(\d{2}):(\d{2})$/.exec(timeStr || "");
  if (!m) return { hour: 12, minute: 0, unknown: true };
  return { hour: Number(m[1]), minute: Number(m[2]), unknown: false };
}

function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + (365 * y2) + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

function getSajuYear(year, month, day) {
  if (month < 2 || (month === 2 && day < 4)) return year - 1;
  return year;
}

function getYearPillar(year, month, day) {
  const sajuYear = getSajuYear(year, month, day);
  const stemIndex = ((sajuYear - 4) % 10 + 10) % 10;
  const branchIndex = ((sajuYear - 4) % 12 + 12) % 12;
  return { stemIndex, branchIndex, text: `${STEMS[stemIndex]}${BRANCHES[branchIndex]}` };
}

function getSolarMonthOrder(month, day) {
  if ((month === 2 && day >= 4) || (month === 3 && day < 6)) return 0;
  if ((month === 3 && day >= 6) || (month === 4 && day < 5)) return 1;
  if ((month === 4 && day >= 5) || (month === 5 && day < 6)) return 2;
  if ((month === 5 && day >= 6) || (month === 6 && day < 6)) return 3;
  if ((month === 6 && day >= 6) || (month === 7 && day < 7)) return 4;
  if ((month === 7 && day >= 7) || (month === 8 && day < 8)) return 5;
  if ((month === 8 && day >= 8) || (month === 9 && day < 8)) return 6;
  if ((month === 9 && day >= 8) || (month === 10 && day < 8)) return 7;
  if ((month === 10 && day >= 8) || (month === 11 && day < 7)) return 8;
  if ((month === 11 && day >= 7) || (month === 12 && day < 7)) return 9;
  if ((month === 12 && day >= 7) || (month === 1 && day < 6)) return 10;
  return 11;
}

function getMonthPillar(yearStemIndex, month, day) {
  const order = getSolarMonthOrder(month, day);
  const branchIndex = (2 + order) % 12;
  const baseByYearStem = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];
  const stemIndex = (baseByYearStem[yearStemIndex] + order) % 10;
  return { stemIndex, branchIndex, text: `${STEMS[stemIndex]}${BRANCHES[branchIndex]}` };
}

function getDayPillar(year, month, day) {
  const ref = 2445733; // 1984-02-02: 갑자일
  const dayIndex = jdn(year, month, day) - ref;
  const stemIndex = ((dayIndex % 10) + 10) % 10;
  const branchIndex = ((dayIndex % 12) + 12) % 12;
  return { stemIndex, branchIndex, text: `${STEMS[stemIndex]}${BRANCHES[branchIndex]}` };
}

function getHourBranchIndex(hour) {
  return Math.floor(((hour + 1) % 24) / 2);
}

function getHourPillar(dayStemIndex, hour) {
  const hourBranchIndex = getHourBranchIndex(hour);
  const baseByDayStem = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];
  const stemIndex = (baseByDayStem[dayStemIndex] + hourBranchIndex) % 10;
  return { stemIndex, branchIndex: hourBranchIndex, text: `${STEMS[stemIndex]}${BRANCHES[hourBranchIndex]}` };
}

function calculatePillars(dateStr, timeStr) {
  const parsedDate = parseDate(dateStr);
  if (!parsedDate) return null;
  const parsedTime = parseTime(timeStr);

  const year = getYearPillar(parsedDate.year, parsedDate.month, parsedDate.day);
  const month = getMonthPillar(year.stemIndex, parsedDate.month, parsedDate.day);
  const day = getDayPillar(parsedDate.year, parsedDate.month, parsedDate.day);
  const hour = getHourPillar(day.stemIndex, parsedTime.hour);

  return { year, month, day, hour, timeUnknown: parsedTime.unknown };
}

function getElementScore(pillars) {
  const score = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const chars = [
    { stem: pillars.year.stemIndex, branch: pillars.year.branchIndex },
    { stem: pillars.month.stemIndex, branch: pillars.month.branchIndex },
    { stem: pillars.day.stemIndex, branch: pillars.day.branchIndex },
    { stem: pillars.hour.stemIndex, branch: pillars.hour.branchIndex }
  ];

  for (const c of chars) {
    score[STEM_ELEMENT[STEMS[c.stem]]] += 1;
    score[BRANCH_ELEMENT[BRANCHES[c.branch]]] += 1;
  }
  return score;
}

function summarizeElementScore(score) {
  const entries = Object.entries(score);
  entries.sort((a, b) => b[1] - a[1]);
  return {
    dominant: entries[0][0],
    weak: entries[entries.length - 1][0],
    text: entries.map(([k, v]) => `${k}:${v}`).join(", ")
  };
}

function createBasicReading(birthDate) {
  const pillars = calculatePillars(birthDate, "12:00");
  if (!pillars) return null;

  const dayMaster = STEMS[pillars.day.stemIndex];
  const dayElement = STEM_ELEMENT[dayMaster];
  const yearPillar = pillars.year.text;

  const summary = [
    `Year Pillar: ${yearPillar} / Day Master: ${dayMaster} (${dayElement})`,
    `Your core pattern is led by ${dayElement} energy, which often shows up as clear direction and steady follow-through.`,
    "This is your free preview. Unlock the full report for complete Four Pillars details and a deeper Five Elements analysis."
  ].join("\n");

  return {
    tags: [`Year ${yearPillar}`, `Day Master ${dayMaster}`, `${dayElement} Core`],
    summary
  };
}

function createDetailedReading(birthDate, birthTime, gender) {
  const pillars = calculatePillars(birthDate, birthTime);
  if (!pillars) return null;

  const score = getElementScore(pillars);
  const summary = summarizeElementScore(score);
  const dayMaster = STEMS[pillars.day.stemIndex];
  const dayElement = STEM_ELEMENT[dayMaster];
  const genderText = GENDER_TEXT[gender] || GENDER_TEXT.unknown;
  const timeInfo = pillars.timeUnknown
    ? "Birth time not provided (hour pillar estimated with 12:00)."
    : `Birth time used: ${birthTime}.`;

  const detail = [
    `Four Pillars: ${pillars.year.text} Year / ${pillars.month.text} Month / ${pillars.day.text} Day / ${pillars.hour.text} Hour`,
    `Day Master: ${dayMaster} (${dayElement}) / Gender: ${genderText}`,
    `Five Elements score: ${summary.text}`,
    `Dominant element: ${summary.dominant} / Weak element: ${summary.weak}`,
    timeInfo,
    "Reading: Treat your dominant element as your natural strength, and build intentional routines to support your weaker element for better long-term balance.",
    "Action tip: Move quickly on clear opportunities, but protect consistency with stable weekly habits for relationships and finances."
  ].join("\n");

  return {
    tags: [
      `Day Master ${dayMaster}`,
      `Strong ${summary.dominant}`,
      `Needs ${summary.weak}`,
      `${pillars.day.text} Day Pillar`
    ],
    detail
  };
}

module.exports = {
  createBasicReading,
  createDetailedReading
};
