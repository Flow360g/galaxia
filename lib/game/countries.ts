import type { EarthQuestion } from "./types";

/**
 * Typed answers are compared on letters and digits only, so punctuation,
 * accents and spacing never decide whether a player got it right.
 */
export function normaliseGuess(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A typed answer the site accepts. */
export function siteAccepts(question: EarthQuestion, text: string): boolean {
  const guess = normaliseGuess(text);
  return guess.length >= 3 && question.accept.some((entry) => guess.includes(normaliseGuess(entry)));
}

/**
 * Every country, and the everyday names for a few of them, normalised. A
 * tester typed "Morocco" for Marrakesh and lost the site for an answer that was
 * right as far as it went; a guess on this list is sent back with a word
 * rather than marked wrong. City states (Singapore, Monaco) are here too, which
 * is harmless: a guess the site accepts is always taken first.
 */
const COUNTRIES = new Set(
  [
    "afghanistan", "albania", "algeria", "andorra", "angola", "antigua and barbuda", "argentina",
    "armenia", "australia", "austria", "azerbaijan", "bahamas", "bahrain", "bangladesh", "barbados",
    "belarus", "belgium", "belize", "benin", "bhutan", "bolivia", "bosnia", "bosnia and herzegovina",
    "botswana", "brazil", "brunei", "bulgaria", "burkina faso", "burundi", "cambodia", "cameroon",
    "canada", "cape verde", "central african republic", "chad", "chile", "china", "colombia",
    "comoros", "congo", "costa rica", "croatia", "cuba", "cyprus", "czechia", "czech republic",
    "denmark", "djibouti", "dominica", "dominican republic", "ecuador", "egypt", "el salvador",
    "equatorial guinea", "eritrea", "estonia", "eswatini", "ethiopia", "fiji", "finland", "france",
    "gabon", "gambia", "georgia", "germany", "ghana", "greece", "grenada", "guatemala", "guinea",
    "guinea bissau", "guyana", "haiti", "honduras", "hungary", "iceland", "india", "indonesia",
    "iran", "iraq", "ireland", "israel", "italy", "ivory coast", "jamaica", "japan", "jordan",
    "kazakhstan", "kenya", "kiribati", "kosovo", "kuwait", "kyrgyzstan", "laos", "latvia",
    "lebanon", "lesotho", "liberia", "libya", "liechtenstein", "lithuania", "luxembourg",
    "madagascar", "malawi", "malaysia", "maldives", "mali", "malta", "marshall islands",
    "mauritania", "mauritius", "mexico", "micronesia", "moldova", "monaco", "mongolia",
    "montenegro", "morocco", "mozambique", "myanmar", "burma", "namibia", "nauru", "nepal",
    "netherlands", "holland", "new zealand", "nicaragua", "niger", "nigeria", "north korea",
    "north macedonia", "macedonia", "norway", "oman", "pakistan", "palau", "palestine", "panama",
    "papua new guinea", "paraguay", "peru", "philippines", "poland", "portugal", "qatar",
    "romania", "russia", "rwanda", "saint lucia", "samoa", "san marino", "saudi arabia", "senegal",
    "serbia", "seychelles", "sierra leone", "singapore", "slovakia", "slovenia", "solomon islands",
    "somalia", "south africa", "south korea", "korea", "south sudan", "spain", "sri lanka", "sudan",
    "suriname", "sweden", "switzerland", "syria", "taiwan", "tajikistan", "tanzania", "thailand",
    "timor leste", "east timor", "togo", "tonga", "trinidad and tobago", "tunisia", "turkey",
    "turkiye", "turkmenistan", "tuvalu", "uganda", "ukraine", "united arab emirates", "uae",
    "united kingdom", "uk", "great britain", "britain", "england", "scotland", "wales",
    "northern ireland", "united states", "united states of america", "usa", "us", "america",
    "uruguay", "uzbekistan", "vanuatu", "vatican", "vatican city", "venezuela", "vietnam", "yemen",
    "zambia", "zimbabwe", "puerto rico", "greenland",
  ].map(normaliseGuess),
);

/**
 * The whole guess is a country, and not something the site accepts. A
 * leading "the" is dropped ("the Netherlands"). A city with its country
 * ("Marrakesh, Morocco") is not a country guess and is judged as usual.
 */
export function isCountryGuess(question: EarthQuestion, text: string): boolean {
  if (siteAccepts(question, text)) return false;
  const guess = normaliseGuess(text).replace(/^the /, "");
  return COUNTRIES.has(guess);
}
