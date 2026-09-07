export interface Course {
  id: string;
  name: string;
  className: string;
  teachers: string[];
  room: string;
  weekday: number;
  sections: number[];
  weeks: number[];
  note: string;
}
export interface Adjustment {
  courseId: string;
  originalDate: string;
  cancelled: boolean;
  date: string;
  sections: number[];
  room: string;
}
export interface Store {
  schemaVersion: 1;
  semesterId: "2026-fall";
  courses: Course[];
  adjustments: Adjustment[];
}
export interface Occurrence {
  course: Course;
  originalDate: string;
  date: string;
  sections: number[];
  room: string;
  adjusted: boolean;
  cancelled: boolean;
}
