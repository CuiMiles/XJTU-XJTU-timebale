import { Store } from "./types";

export function mergeImported(current: Store, incoming: Store): Store {
  if (!incoming.courses.length || incoming.courses.some((c) => !c.id.startsWith("gmis-")))
    throw new Error("导入数据格式有误");
  const manual = current.courses.filter((c) => !c.id.startsWith("gmis-"));
  const courses = [...manual, ...incoming.courses];
  const ids = new Set(courses.map((c) => c.id));
  if (ids.size !== courses.length) throw new Error("导入课程有重复 ID");
  return {
    ...current,
    courses,
    adjustments: current.adjustments.filter((a) => ids.has(a.courseId)),
  };
}
