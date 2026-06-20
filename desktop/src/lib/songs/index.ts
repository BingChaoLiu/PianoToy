import type { Song } from "@/types/midi";
import { buildTwinkleSong } from "./twinkle";
import { buildOdeToJoySong } from "./ode";
import { buildFurEliseSong } from "./fur-elise";
import { buildHappyBirthdaySong } from "./happy-birthday";

export interface DemoEntry {
  id: string;
  name: string;
  build: () => Song;
}

export const DEMOS: DemoEntry[] = [
  { id: "twinkle",  name: "Twinkle Twinkle Little Star", build: buildTwinkleSong },
  { id: "ode",      name: "Ode to Joy (Beethoven)",      build: buildOdeToJoySong },
  { id: "furelise", name: "Fur Elise (opening)",         build: buildFurEliseSong },
  { id: "happybd",  name: "Happy Birthday",              build: buildHappyBirthdaySong },
];
