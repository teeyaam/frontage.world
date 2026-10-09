// Content for /pricing-guide. Owners set any price they like (like
// Facebook Marketplace); this page only helps them gauge one.
//
// OWNER REVIEW NEEDED: the ranges are illustrative starting points in AUD
// per month, partly anchored on what Australian vehicle-advertising
// agencies publicly pay drivers (October 2026: about $45–$100 a week for
// window-to-full ads; $900–$1,500 per 3-month full-wrap campaign). Truck
// and semi-trailer ranges have no published benchmark — adjust them as
// real deals come in.

export const PRICING_SCENARIOS = [
  {
    title: "Car — door decals or magnetic signs",
    category: "car",
    range: "$50–$150 / month",
    seenBy: "Other drivers and pedestrians on your usual routes and wherever you park",
    notes: "Easy to fit and remove. Daily commuters through busy suburbs, and cars parked on shopping strips, sit at the top of the range.",
  },
  {
    title: "Car — full wrap",
    category: "car",
    range: "$250–$500 / month",
    seenBy: "Everyone around the car, from every angle",
    notes: "The advertiser usually pays for printing, fitting and removal. Rear windows stay see-through on passenger cars.",
  },
  {
    title: "Ute or van — tailgate and rear window",
    category: "ute",
    range: "$100–$250 / month",
    seenBy: "The cars queued behind you in traffic",
    notes: "Utes and vans can have the rear window covered. Tradies who drive between job sites all day are especially attractive to local brands.",
  },
  {
    title: "Van — full wrap",
    category: "van",
    range: "$300–$600 / month",
    seenBy: "Large, flat sides seen by traffic and pedestrians",
    notes: "Delivery and service vans that park on busy streets several times a day get the most attention.",
  },
  {
    title: "Truck — box sides",
    category: "truck",
    range: "$400–$1,000 / month",
    seenBy: "Highway and suburban traffic, at eye level for car drivers",
    notes: "Removalists, refrigerated and general freight trucks. Check your freight contracts don't control what your truck displays.",
  },
  {
    title: "Semi-trailer — curtain sides",
    category: "semi_trailer",
    range: "$800–$2,000 / month",
    seenBy: "Interstate and highway traffic over thousands of kilometres",
    notes: "The biggest moving canvas. Printed curtains must still meet load-restraint rules, and rear marking plates must stay uncovered.",
  },
  {
    title: "Caravan or campervan — rear and sides",
    category: "caravan",
    range: "$100–$300 / month",
    seenBy: "Holiday traffic, caravan parks and regional towns",
    notes: "Suits tourism, outdoor and regional brands, especially over school holidays.",
  },
  {
    title: "Food truck or trailer — side panels",
    category: "trailer",
    range: "$150–$400 / month",
    seenBy: "Queues at markets, events and lunch spots",
    notes: "People stand next to it for minutes at a time. Ads must relate to a working trailer — a trailer parked just to advertise isn't allowed in many places.",
  },
];

export const PRICING_FACTORS = [
  { title: "Where and how far you drive", body: "Busy routes, city centres and long highway runs are worth more than quiet streets. Put your usual routes and rough km a week in the listing." },
  { title: "Where it's parked", body: "A vehicle parked all day on a shopping strip, outside a school or at a busy depot keeps working when it's not moving." },
  { title: "How much of the vehicle", body: "A full wrap or truck curtain is worth far more than a door decal — but costs more to print and fit." },
  { title: "How long the deal runs", body: "Many owners offer a lower monthly rate for 3, 6 or 12 months. Say so in the price details (e.g. “min 3 months”)." },
  { title: "Who pays for printing, fitting and removal", body: "Say whether the advertiser arranges it or whether your price includes it. Most deals have the advertiser pay." },
  { title: "Exclusivity", body: "Will you promise not to carry a competitor's ad? That's worth something to an advertiser." },
  { title: "Condition of the vehicle", body: "A clean, newer vehicle shows a brand better. Good photos matter more than anything else on the listing." },
  { title: "Rules you must keep", body: "Keep windscreens, front side windows, number plates, lights and truck warning plates clear; cars' rear windows must stay see-through. Tell your insurer and lender." },
];

export const PRICE_NOTE_EXAMPLES = ["per month", "per week", "per month, min 3 months", "advertiser pays printing and fitting", "includes fitting", "negotiable"];
