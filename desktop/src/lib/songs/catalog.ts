// Score catalog: built-in demos + public domain piano pieces.
// Public domain pieces are loaded from public/midi/ on demand.

import type { Song } from "@/types/midi";
import { buildTwinkleSong } from "./twinkle";
import { buildOdeToJoySong } from "./ode";
import { buildFurEliseSong } from "./fur-elise";
import { buildHappyBirthdaySong } from "./happy-birthday";
import { buildBachMinuetG } from "./bach-minuet-g";
import { buildBachPreludeC } from "./bach-prelude-c";
import { buildMozartTwinkleVar } from "./mozart-twinkle-var";
import { buildBeethovenSonatinaG } from "./beethoven-sonatina-g";
import { buildChopinPreludeE } from "./chopin-prelude-e";
import { buildSchumannWildHorseman } from "./schumann-wild-horseman";
import { buildTchaikovskyOldFrench } from "./tchaikovsky-old-french";
import { buildBurgmuellerArabesque } from "./burgmueller-arabesque";
import type { ScoreDifficulty } from "@/store/useScoreLibraryStore";

export interface CatalogEntry {
  id: string;
  name: string;
  composer: string;
  difficulty: ScoreDifficulty;
  duration: number;
  category: string;
  build: (() => Song) | null;
  filePath: string | null;
}

export const SCORE_CATALOG: CatalogEntry[] = [
  // Built-in demos (code-generated)
  {
    id: "twinkle",
    name: "Twinkle Twinkle Little Star",
    composer: "Traditional",
    difficulty: "easy",
    duration: 30,
    category: "traditional",
    build: buildTwinkleSong,
    filePath: null,
  },
  {
    id: "ode",
    name: "Ode to Joy",
    composer: "Beethoven",
    difficulty: "easy",
    duration: 40,
    category: "classical",
    build: buildOdeToJoySong,
    filePath: null,
  },
  {
    id: "furelise",
    name: "Fur Elise (opening)",
    composer: "Beethoven",
    difficulty: "medium",
    duration: 55,
    category: "classical",
    build: buildFurEliseSong,
    filePath: null,
  },
  {
    id: "happybd",
    name: "Happy Birthday",
    composer: "Traditional",
    difficulty: "easy",
    duration: 20,
    category: "traditional",
    build: buildHappyBirthdaySong,
    filePath: null,
  },
  // Public domain pieces (code-generated, all composers deceased 70+ years)
  {
    id: "bach-minuet-g",
    name: "Minuet in G Major",
    composer: "J.S. Bach",
    difficulty: "easy",
    duration: 60,
    category: "classical",
    build: buildBachMinuetG,
    filePath: null,
  },
  {
    id: "bach-prelude-c",
    name: "Prelude in C Major (WTC I)",
    composer: "J.S. Bach",
    difficulty: "medium",
    duration: 120,
    category: "classical",
    build: buildBachPreludeC,
    filePath: null,
  },
  {
    id: "mozart-twinkle-var",
    name: "Twinkle Variations (K.265)",
    composer: "Mozart",
    difficulty: "medium",
    duration: 90,
    category: "classical",
    build: buildMozartTwinkleVar,
    filePath: null,
  },
  {
    id: "beethoven-sonatina",
    name: "Sonatina in G (Anh.5)",
    composer: "Beethoven",
    difficulty: "easy",
    duration: 70,
    category: "classical",
    build: buildBeethovenSonatinaG,
    filePath: null,
  },
  {
    id: "chopin-prelude-e",
    name: "Prelude in E minor (Op.28 No.4)",
    composer: "Chopin",
    difficulty: "medium",
    duration: 150,
    category: "classical",
    build: buildChopinPreludeE,
    filePath: null,
  },
  {
    id: "schumann-wild-horseman",
    name: "Wild Horseman (Album for the Young)",
    composer: "Schumann",
    difficulty: "medium",
    duration: 50,
    category: "classical",
    build: buildSchumannWildHorseman,
    filePath: null,
  },
  {
    id: "tchaikovsky-old-french",
    name: "Old French Song (Album for the Young)",
    composer: "Tchaikovsky",
    difficulty: "easy",
    duration: 45,
    category: "classical",
    build: buildTchaikovskyOldFrench,
    filePath: null,
  },
  {
    id: "burgmueller-arabesque",
    name: "Arabesque (Op.100 No.2)",
    composer: "Burgmuller",
    difficulty: "medium",
    duration: 60,
    category: "classical",
    build: buildBurgmuellerArabesque,
    filePath: null,
  },
];

export const CATEGORIES = [
  { id: "all", labelKey: "score.category_all" },
  { id: "classical", labelKey: "score.category_classical" },
  { id: "traditional", labelKey: "score.category_traditional" },
  { id: "custom", labelKey: "score.category_custom" },
] as const;

export const DIFFICULTIES = [
  { id: "all", labelKey: "score.diff_all" },
  { id: "easy", labelKey: "score.diff_easy" },
  { id: "medium", labelKey: "score.diff_medium" },
  { id: "hard", labelKey: "score.diff_hard" },
] as const;
