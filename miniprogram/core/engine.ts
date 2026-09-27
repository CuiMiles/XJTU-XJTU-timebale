import { Store, Occurrence } from "./types";
import { dateOf, HOLIDAYS, weekOf } from "./calendar";
import { COLORS, colorChoice } from "./colors";
export function occurrence(
  s: Store,
  courseId: string,
  originalDate: string,
): Occurrence | undefined {
  const c = s.courses.find((c) => c.id === courseId);
  if (!c) return;
  const a = s.adjustments.find(
    (a) => a.courseId === courseId && a.originalDate === originalDate,
  );
  return {
    course: c,
    originalDate,
    date: a ? a.date : originalDate,
    sections: a ? a.sections : c.sections,
    room: a ? a.room : c.room,
    adjusted: !!a,
    cancelled: !!a && a.cancelled,
  };
}
export function schedule(s: Store, week: number): Occurrence[] {
  const out: Occurrence[] = [];
  s.courses.forEach((c) =>
    c.weeks.forEach((w) => {
      const original = dateOf(w, c.weekday);
      const o = occurrence(s, c.id, original)!;
      if (
        !o.cancelled &&
        weekOf(o.date) === week &&
        (o.adjusted || !HOLIDAYS.includes(original))
      )
        out.push(o);
    }),
  );
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.sections[0] - b.sections[0],
  );
}
const NAMED_COLORS: [string, number][] = [
  ["材料科学", 0], ["分布式系统", 1], ["日语二外", 2],
  ["数据库前沿", 3], ["马克思主义", 4], ["深度学习", 5],
  ["工程伦理", 6], ["数据库系统", 7], ["体育", 5],
];
const normalized = (s: string): string =>
  s.trim().replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
export function courseTheme(name: string) {
  const match = NAMED_COLORS.find(([part]) => name.includes(part));
  if (match) return COLORS[match[1]];
  let h = 0;
  for (const ch of normalized(name)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}
export function color(name: string): string {
  return courseTheme(name).background;
}
interface DisplayGroup {
  o: Occurrence;
  start: number;
  end: number;
  members: Occurrence[];
}
export function blocks(items: Occurrence[]) {
  const groups: DisplayGroup[] = [];
  items.forEach((o) => {
    const sections = [...o.sections].sort((a, b) => a - b);
    let start = sections[0],
      end = start;
    const emit = () =>
      groups.push({
        o: {
          ...o,
          sections: Array.from(
            { length: end - start + 1 },
            (_, i) => start + i,
          ),
        },
        start,
        end,
        members: [o],
      });
    sections.slice(1).forEach((n) => {
      if (n === end + 1) end = n;
      else {
        emit();
        start = end = n;
      }
    });
    emit();
  });
  groups.sort((a, b) => a.o.date.localeCompare(b.o.date) || a.start - b.start);
  const sameLesson = (a: DisplayGroup, b: DisplayGroup) =>
    a.o.date === b.o.date &&
    a.o.originalDate === b.o.originalDate &&
    normalized(a.o.course.name) === normalized(b.o.course.name) &&
    normalized(a.o.room) === normalized(b.o.room) &&
    normalized(a.o.course.className) === normalized(b.o.course.className) &&
    a.o.course.note.trim() === b.o.course.note.trim() &&
    a.o.adjusted === b.o.adjusted &&
    JSON.stringify(a.o.course.teachers.map(normalized).sort()) ===
      JSON.stringify(b.o.course.teachers.map(normalized).sort());
  const merged: DisplayGroup[] = [];
  for (const b of groups) {
    const previous = merged.find(
      (a) => a.end + 1 === b.start && sameLesson(a, b),
    );
    if (previous) {
      previous.end = b.end;
      previous.o = {
        ...previous.o,
        sections: [...previous.o.sections, ...b.o.sections],
      };
      for (const member of b.members)
        if (
          !previous.members.some(
            (m) =>
              m.course.id === member.course.id &&
              m.originalDate === member.originalDate,
          )
        )
          previous.members.push(member);
    } else merged.push({ ...b, members: [...b.members] });
  }
  return merged.map((b, i) => ({
    ...b,
    key: i,
    top: (b.start - 1) * 116,
    height: (b.end - b.start + 1) * 116 - 6,
    conflicts: merged.filter(
      (x) => x.o.date === b.o.date && x.start <= b.end && x.end >= b.start,
    ).length,
    color: colorChoice(b.o.course.color)?.background || color(b.o.course.name),
    theme: colorChoice(b.o.course.color) || courseTheme(b.o.course.name),
  }));
}
