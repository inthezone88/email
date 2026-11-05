export type SubjectStyle = "Question" | "Number" | "Urgency" | "Plain";
export const SUBJECT_STYLES: SubjectStyle[] = ["Question", "Number", "Urgency", "Plain"];

const URGENCY =
  /\b(last (call|chance)|final|deadline|ends? (today|tonight|soon|friday|sunday|monday|midnight)|closing|closes|expires?|expiring|hurry|urgent|now or never|don'?t miss|only \d+ (left|spots?|seats?|slots?)|limited|today only|tonight|24 hours|48 hours|last day)\b/i;

/** Rule-based subject classification at ingestion. Order matters: urgency beats question beats number. */
export function classifySubject(subject: string | null | undefined): SubjectStyle {
  const s = (subject ?? "").trim();
  if (!s) return "Plain";
  if (URGENCY.test(s)) return "Urgency";
  if (s.includes("?")) return "Question";
  if (/\d/.test(s.replace(/#\d+/g, ""))) return "Number"; // "#42" in "Newsletter #42" is an issue number, not a hook
  return "Plain";
}
