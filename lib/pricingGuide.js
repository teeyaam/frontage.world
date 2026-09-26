// Content for /pricing-guide. Sellers set any price they like (like
// Facebook Marketplace); this page only helps them gauge one.
//
// OWNER REVIEW NEEDED: the ranges below are illustrative starting points,
// in AUD per month, not market data. Adjust them as real listings and
// deals come in.

export const PRICING_SCENARIOS = [
  {
    title: "Front fence on a quiet suburban street",
    category: "fence",
    range: "$40–$120 / month",
    seenBy: "Local residents, school runs, a few hundred passers-by a day",
    notes: "Best for local trades, real estate agents and nearby shops. Corner blocks and fences near a school, shop or bus stop sit at the top of the range.",
  },
  {
    title: "Side wall facing a busy main road",
    category: "wall",
    range: "$300–$1,200 / month",
    seenBy: "Tens of thousands of cars a day, plus people waiting at the lights",
    notes: "Price climbs with size and how long drivers can see it. A large, clear wall at a set of traffic lights is worth far more than one glimpsed at 70km/h.",
  },
  {
    title: "Café or shop window on a busy strip",
    category: "window",
    range: "$150–$600 / month",
    seenBy: "Pedestrians at eye level, often with time to read",
    notes: "Foot traffic matters more than size here. City-centre and beachside strips sit at the top. Say whether the advertiser supplies a decal or poster.",
  },
  {
    title: "Gym, studio or indoor wall",
    category: "indoor",
    range: "$80–$300 / month",
    seenBy: "Members and customers who see it repeatedly, often for long stretches",
    notes: "A smaller but captive audience — ideal for health, food and local services. Mention your member numbers or weekly visits in the description.",
  },
  {
    title: "Rooftop or high wall visible from a highway",
    category: "billboard",
    range: "$800–$3,000+ / month",
    seenBy: "Very high vehicle numbers, from a distance",
    notes: "Needs to be large to be readable. Council permits are usually required, so say whether you already have one.",
  },
  {
    title: "Vehicle — ute, van or trailer",
    category: "vehicle",
    range: "$150–$600 / month",
    seenBy: "Everywhere the vehicle goes, or wherever it's parked",
    notes: "Daily metro driving, or a trailer parked on a busy road, earns the most. Say where it drives or parks, and who pays for the wrap.",
  },
  {
    title: "Digital screen in a venue or shopfront",
    category: "digital_screen",
    range: "$50–$300 / month per slot",
    seenBy: "Whoever passes or visits, depending on where it faces",
    notes: "Usually sold as a share of a rotation (e.g. one 15-second slot in a 2-minute loop). Price per slot, and say how many slots there are.",
  },
  {
    title: "Rural fence on a highway",
    category: "fence",
    range: "$100–$500 / month",
    seenBy: "Highway traffic, often tourists and regional travellers",
    notes: "Good for motels, wineries and town businesses. Long, straight approaches that give drivers time to read it are worth more.",
  },
];

export const PRICING_FACTORS = [
  { title: "How many people see it", body: "Traffic counts, foot traffic or member numbers. If you know a figure, include it in your description." },
  { title: "How long they see it for", body: "People waiting at lights, queuing or sitting in a café see an ad for longer than drivers passing at speed." },
  { title: "Size and sightlines", body: "Bigger isn't always better — a clear, unobstructed view at eye level often beats a large space hidden behind trees." },
  { title: "Location", body: "City centres and busy shopping strips command more than quiet streets. Compare with similar spaces nearby on Frontage." },
  { title: "How long the deal runs", body: "Many owners offer a lower monthly rate for longer commitments. Say so in the price details (e.g. “min 3 months”)." },
  { title: "Lighting", body: "A lit space works at night too — worth mentioning, and worth more." },
  { title: "Exclusivity", body: "Will you promise not to rent nearby space to a competitor? That's worth something to an advertiser." },
  { title: "Permits and rules", body: "Some councils, strata schemes and landlords restrict signage. A space that's clear to use is easier to rent." },
  { title: "Who pays for printing and install", body: "Say whether the price includes printing, installing and removing the ad, or whether the advertiser arranges that." },
];

export const PRICE_NOTE_EXAMPLES = ["per month", "per week", "per month, min 3 months", "negotiable", "includes install", "per 15-sec slot"];
