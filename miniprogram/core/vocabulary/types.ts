export type Level = "L1" | "L2" | "L3" | "L4";
export type Rating = "unknown" | "fuzzy" | "known";
export interface IndexEntry {
  id: string;
  word: string;
  level: Level;
  shard: string;
  variants: string[];
  deep: boolean;
}
export interface Block {
  title: string;
  en: string;
  zh?: string;
}
export interface Deep {
  senseId: string;
  blocks: Block[];
  status: "editorial";
  version: string;
}
export interface Sense {
  id: string;
  pos: string;
  definition: string;
  examples: string[];
  synonyms: string[];
}
export interface Entry {
  id: string;
  word: string;
  ipa: string;
  variants: string[];
  senses: Sense[];
  zh?: string;
  deep?: Deep;
}
export interface Progress {
  state: "learning" | "review" | "familiar";
  stage: number;
  due?: string;
  first?: string;
  last?: string;
}
export interface Attempt {
  id: string;
  entryId: string;
  mode: "new" | "review" | "retry";
}
export interface Session {
  day: string;
  queue: Attempt[];
  retries: Record<string, number>;
  failed: string[];
}
export interface Daily {
  newIds: string[];
  reviewIds: string[];
  attempts: number;
  spellingAttempts: number;
  spellingCorrect: number;
  spellingIds: string[];
}
export interface ReviewEvent {
  id: string;
  entryId: string;
  day: string;
  rating: Rating;
  mode: Attempt["mode"];
}
export interface Store {
  schemaVersion: 1;
  contentVersion: string;
  revision: number;
  settings: {
    dailyNewLimit: number;
    levels: Level[];
    familiarHintSeen: boolean;
  };
  progress: Record<string, Progress>;
  favorites: string[];
  daily: Record<string, Daily>;
  events: ReviewEvent[];
  session?: Session;
}
