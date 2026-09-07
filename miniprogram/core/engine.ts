import { Store, Occurrence } from "./types";
import { dateOf, HOLIDAYS, weekOf } from "./calendar";
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
export function color(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ["#dcebf8", "#e0efdf", "#faf0cf", "#eee3f5", "#f7e3dd", "#dbefed"][
    Math.abs(h) % 6
  ];
}
export function blocks(items: Occurrence[]) {
  const groups: any[] = [];
  items.forEach((o) => {
    let start = o.sections[0],
      end = start;
    const emit = () => groups.push({ o, start, end });
    o.sections.slice(1).forEach((n) => {
      if (n === end + 1) end = n;
      else {
        emit();
        start = end = n;
      }
    });
    emit();
  });
  return groups.map((b, i) => {
    const overlaps = groups.filter(
      (x) => x.o.date === b.o.date && x.start <= b.end && x.end >= b.start,
    );
    return {
      ...b,
      key: i,
      top: (b.start - 1) * 116,
      height: (b.end - b.start + 1) * 116 - 6,
      conflicts: overlaps.length,
      color: color(b.o.course.name),
    };
  });
}
