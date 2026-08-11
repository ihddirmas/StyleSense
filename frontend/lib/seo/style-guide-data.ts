/**
 * Data + generation logic for the programmatic /style/[slug] SEO pages.
 * Garment x occasion combos are computed from formality/season compatibility
 * rather than hand-listed, so no nonsensical pairing (e.g. "leather jacket for
 * a beach wedding") ever gets a page. Capped at 100 to keep the sitemap sane.
 */

type Formality = 1 | 2 | 3; // 1 casual, 2 smart-casual, 3 dressy
type Season = "warm" | "cool" | "any";

export interface Garment {
  id: string;
  label: string;
  formality: Formality;
  season: Season;
  silhouette: string;
  fabricNote: string;
  colorTips: string[];
  pairingTips: string[];
}

export interface Occasion {
  id: string;
  label: string;
  formality: Formality;
  season: Season;
  dressCode: string;
  practicalTips: string[];
}

export const GARMENTS: Garment[] = [
  {
    id: "little-black-dress",
    label: "little black dress",
    formality: 3,
    season: "any",
    silhouette: "a fitted or A-line cut that skims rather than clings",
    fabricNote: "a matte crepe or ponte knit holds its shape all night without wrinkling",
    colorTips: ["gold or silver jewelry for evening warmth", "a jewel-tone bag or heel as the single accent color"],
    pairingTips: ["a tailored blazer thrown over the shoulders for arrival and departure", "a low bun or sleek ponytail so the neckline stays the focal point"],
  },
  {
    id: "denim-jacket",
    label: "denim jacket",
    formality: 1,
    season: "cool",
    silhouette: "a cropped or slightly oversized cut worn open over a fitted layer",
    fabricNote: "mid-wash denim reads more polished than raw or heavily distressed washes",
    colorTips: ["white or cream underneath to keep the palette light", "one warm accent (rust, mustard) to avoid an all-blue look"],
    pairingTips: ["push the sleeves up to the elbow for a less bulky line", "swap the top button for a brooch or pin if it runs boxy"],
  },
  {
    id: "white-button-down",
    label: "white button-down shirt",
    formality: 2,
    season: "any",
    silhouette: "a slightly relaxed fit through the body, tapered at the cuff",
    fabricNote: "cotton poplin presses crisp; linen-cotton blends forgive travel wrinkles",
    colorTips: ["gold jewelry reads warmer against white than silver", "a single bold bottom (color or print) since the top stays neutral"],
    pairingTips: ["half-tuck it rather than full-tuck for a less formal line", "roll the cuffs twice, not just once, so they stay put"],
  },
  {
    id: "midi-skirt",
    label: "midi skirt",
    formality: 2,
    season: "any",
    silhouette: "a hem that hits mid-calf, not ankle, to avoid shortening the leg line",
    fabricNote: "a slight structure (not clingy jersey) holds the shape while walking",
    colorTips: ["tonal shoes to elongate the leg line", "a fitted top so the volume stays at the hem, not the waist"],
    pairingTips: ["heels or a low boot rather than a flat sandal, which can shorten the silhouette", "a belt at the natural waist if the skirt is high-waisted"],
  },
  {
    id: "wide-leg-trousers",
    label: "wide-leg trousers",
    formality: 2,
    season: "any",
    silhouette: "a fitted waist that flares from the hip so the volume doesn't read as bulk",
    fabricNote: "a fabric with some drape (crepe, viscose) falls better than stiff cotton",
    colorTips: ["a fitted, tucked top to keep proportion at the waist", "a heel with some height so the hem doesn't drag"],
    pairingTips: ["hem length should just graze the top of the shoe", "avoid a baggy top on top of wide trousers — pick one volume zone, not two"],
  },
  {
    id: "blazer",
    label: "tailored blazer",
    formality: 3,
    season: "any",
    silhouette: "shoulders that sit at the natural shoulder line, not padded past it",
    fabricNote: "a structured wool or wool-blend holds a crisp line through a long day",
    colorTips: ["one neutral base color so it pairs with everything else in the closet", "a contrast lining or pocket square as the only pattern in the outfit"],
    pairingTips: ["leave the bottom button undone, always", "sleeves should end at the wrist bone, showing a half-inch of shirt cuff"],
  },
  {
    id: "silk-slip-dress",
    label: "silk slip dress",
    formality: 3,
    season: "warm",
    silhouette: "a bias cut that skims the body without clinging to it",
    fabricNote: "true silk or a silk-look satin drapes better than stiffer synthetics",
    colorTips: ["jewel tones photograph better than pastels in evening light", "minimal jewelry — the fabric sheen is already doing the work"],
    pairingTips: ["a slip like this needs a proper undergarment layer, not an afterthought", "a light cardigan or shawl for temperature swings after sunset"],
  },
  {
    id: "cropped-sweater",
    label: "cropped sweater",
    formality: 1,
    season: "cool",
    silhouette: "a hem that hits at or just above the natural waist, no higher",
    fabricNote: "a finer gauge knit layers more easily than a chunky cable knit",
    colorTips: ["a high-waisted bottom so no skin shows at the gap", "one warm neutral (camel, cream) to soften a cropped silhouette"],
    pairingTips: ["high-waisted bottoms are non-negotiable with a cropped top", "layer a collared shirt underneath for a dressier read"],
  },
  {
    id: "linen-pants",
    label: "linen trousers",
    formality: 1,
    season: "warm",
    silhouette: "a relaxed straight leg that skims rather than clings in heat",
    fabricNote: "a linen-cotton blend wrinkles less than 100% linen while keeping the breathability",
    colorTips: ["stick to warm neutrals — stone, sand, white — for a cohesive summer palette", "one woven or straw accessory to reinforce the warm-weather mood"],
    pairingTips: ["a fitted tank or camisole keeps the volume at the leg, not doubled up top", "leather sandals read more elevated than rubber ones with linen"],
  },
  {
    id: "leather-jacket",
    label: "leather jacket",
    formality: 2,
    season: "cool",
    silhouette: "a cropped or moto cut that hits at the hip, not mid-thigh",
    fabricNote: "genuine or a heavier faux leather holds structure better than a thin pleather",
    colorTips: ["black leather is the most versatile; brown reads softer with warm tones", "let the jacket be the only 'hard' texture — pair with something soft underneath"],
    pairingTips: ["worn open over a dress instantly cuts formality without changing the dress", "a silk or satin layer underneath balances the leather's edge"],
  },
  {
    id: "floral-maxi-dress",
    label: "floral maxi dress",
    formality: 1,
    season: "warm",
    silhouette: "a defined waist, even on a flowy dress, keeps the shape from reading shapeless",
    fabricNote: "a lightweight viscose or cotton voile moves without clinging in heat",
    colorTips: ["match one jewelry piece to the dominant floral color, not all of them", "a solid-color sandal grounds a busy print"],
    pairingTips: ["a belt at the waist if the cut runs loose through the middle", "gather the length slightly at the ankle if walking on grass or sand"],
  },
  {
    id: "tailored-jumpsuit",
    label: "tailored jumpsuit",
    formality: 3,
    season: "any",
    silhouette: "a defined waist seam so the fabric doesn't read as one shapeless column",
    fabricNote: "a fabric with slight stretch makes sitting and walking far more comfortable",
    colorTips: ["a single statement earring since there's no neckline break to draw the eye", "a heel that matches the jumpsuit's undertone (warm or cool) elongates the leg"],
    pairingTips: ["check the rise and inseam before wearing it out for the first time — jumpsuits vary a lot by brand", "a thin belt at the waist if the cut runs boxy"],
  },
  {
    id: "knit-cardigan",
    label: "knit cardigan",
    formality: 1,
    season: "cool",
    silhouette: "a length that hits at the hip layers more easily than a long duster cardigan",
    fabricNote: "a lightweight merino layers indoors without overheating",
    colorTips: ["a cardigan in a warm neutral works as a base layer for almost anything else in the closet", "let one button close at the waist rather than leaving it fully open and shapeless"],
    pairingTips: ["a fitted layer underneath keeps the silhouette from reading boxy", "sleeves pushed up slightly look more intentional than left long and loose"],
  },
  {
    id: "statement-blouse",
    label: "statement blouse",
    formality: 2,
    season: "any",
    silhouette: "let the blouse be the one statement piece — keep everything else simple",
    fabricNote: "a fabric with some body (silk, crepe) holds prints and volume better than thin jersey",
    colorTips: ["pull one color from the print for the bottom half to tie the look together", "skip competing jewelry if the blouse already has pattern or volume"],
    pairingTips: ["tuck it in fully if it has volume, to define the waist", "a plain, dark bottom lets a printed or ruffled blouse stay the focus"],
  },
];

export const OCCASIONS: Occasion[] = [
  {
    id: "beach-wedding",
    label: "beach wedding",
    formality: 3,
    season: "warm",
    dressCode: "dressy but barefoot-friendly — think elevated, not black-tie",
    practicalTips: ["wedge heels or flat sandals hold up far better than stilettos on sand", "a lightweight fabric matters more here than anywhere else on this list — humidity is real"],
  },
  {
    id: "business-meeting",
    label: "business meeting",
    formality: 3,
    season: "any",
    dressCode: "polished and structured — this is not the day to test a trend",
    practicalTips: ["closed-toe shoes read more authoritative in most corporate settings", "keep jewelry minimal enough that it doesn't make noise in a quiet room"],
  },
  {
    id: "first-date",
    label: "first date",
    formality: 2,
    season: "any",
    dressCode: "put-together but not overdone — comfort reads as confidence",
    practicalTips: ["wear something you've already tested sitting down in for an hour", "pick shoes you can actually walk in if the date moves locations"],
  },
  {
    id: "weekend-brunch",
    label: "weekend brunch",
    formality: 1,
    season: "any",
    dressCode: "relaxed but intentional — elevated basics, not loungewear",
    practicalTips: ["a bag with both hands free beats a clutch when there's a table and food involved", "sunglasses double as an accessory if brunch has any outdoor seating"],
  },
  {
    id: "holiday-party",
    label: "holiday party",
    formality: 3,
    season: "cool",
    dressCode: "festive within reason — one statement element, not five",
    practicalTips: ["a coat check plan matters — wear (or bring) something you don't mind carrying all night", "richer, deeper colors photograph better under string lights than pastels"],
  },
  {
    id: "job-interview",
    label: "job interview",
    formality: 3,
    season: "any",
    dressCode: "one notch more formal than the company's actual day-to-day dress code",
    practicalTips: ["fit matters more than trend here — nothing should need mid-interview adjusting", "research the company's actual dress norms first; 'formal' means different things at a bank vs. a startup"],
  },
  {
    id: "summer-festival",
    label: "summer festival",
    formality: 1,
    season: "warm",
    dressCode: "comfortable and durable — you'll be standing and walking for hours",
    practicalTips: ["a crossbody bag beats anything you have to hold all day", "closed shoes with real support outlast sandals once the crowd gets dense"],
  },
  {
    id: "winter-formal-event",
    label: "winter formal event",
    formality: 3,
    season: "cool",
    dressCode: "elevated and warm — the coat is part of the outfit, not an afterthought",
    practicalTips: ["plan the outer layer with the outfit, not around it — most winter formal looks are ruined by a mismatched coat", "closed-toe shoes with a bit of grip matter more than heel height if there's any chance of ice"],
  },
  {
    id: "girls-night-out",
    label: "girls' night out",
    formality: 2,
    season: "any",
    dressCode: "a little more done-up than daywear — this is the one to have fun with",
    practicalTips: ["pick one going-out shoe you can actually dance in", "a going-out top with structure holds up better through a long night than something you have to keep adjusting"],
  },
];

export interface StyleGuide {
  slug: string;
  garment: Garment;
  occasion: Occasion;
  formalityGap: number;
}

function isCompatible(g: Garment, o: Occasion): boolean {
  const formalityGap = Math.abs(g.formality - o.formality);
  if (formalityGap > 2) return false;
  const seasonOk = g.season === "any" || o.season === "any" || g.season === o.season;
  return seasonOk;
}

function buildSlug(g: Garment, o: Occasion): string {
  return `${g.id}-for-a-${o.id}`;
}

const ALL_GUIDES: StyleGuide[] = GARMENTS.flatMap((g) =>
  OCCASIONS.filter((o) => isCompatible(g, o)).map((o) => ({
    slug: buildSlug(g, o),
    garment: g,
    occasion: o,
    formalityGap: Math.abs(g.formality - o.formality),
  }))
);

// Best-fit pairings first (smallest formality gap), capped so the sitemap stays
// a curated ~100 rather than every mathematically-possible combination.
export const STYLE_GUIDES: StyleGuide[] = [...ALL_GUIDES]
  .sort((a, b) => a.formalityGap - b.formalityGap || a.slug.localeCompare(b.slug))
  .slice(0, 100);

export function getAllSlugs(): string[] {
  return STYLE_GUIDES.map((g) => g.slug);
}

export function getStyleGuide(slug: string): StyleGuide | undefined {
  return STYLE_GUIDES.find((g) => g.slug === slug);
}
