// Frontage's labelled example listings: one vehicle in each of the 12
// largest economies we serve, showing what a finished listing looks like.
// They are always badged "Example", can't be messaged, never expire and
// sort after real listings (see lib/db.js).
//
// Locations are district-level only, so no real person is tied to a
// made-up listing. Prices are illustrative monthly figures in each
// country's currency. Each entry's `scene` and `spot` feed the image prompt
// (imagePrompt below) used to generate its photo; the admin uploads the
// image at /admin/examples as <key>.jpg, e.g. EXV-JP.jpg.

const DATA = [
  {
    cc: "US", district: "The Heights", city: "Houston, Texas", lat: 29.798, lng: -95.398,
    category: "ute", title: "Full-size pickup, job sites across Houston daily", price: 300, note: "per month, advertiser pays the decals",
    panels: "doors,boot,rear_window", area: "The Heights to job sites all over Houston, Monday to Saturday", km: 900, w: 1.5, h: 0.9,
    desc: "White full-size pickup I drive for my renovation business. On the freeway every morning, then parked outside clients' homes most of the day. Both front doors and the tailgate are free for decals, and the rear window can take perforated film.",
    scene: "a clean white full-size pickup truck parked on a leafy residential street outside a house being renovated",
    spot: "the driver's door and the tailgate",
  },
  {
    cc: "DE", district: "Billbrook", city: "Hamburg", lat: 53.53, lng: 10.09,
    category: "semi_trailer", title: "Curtain-side semi-trailer, Hamburg to Munich every week", price: 1200, note: "per month, 6 month minimum",
    panels: "curtains", area: "A7 and A9 autobahns, Hamburg to Munich and back twice a week", km: 3200, w: 13.6, h: 2.7,
    desc: "Tautliner semi-trailer on a fixed weekly run down the A7 and A9. Both curtains can be printed (the advertiser supplies printed curtains made to load-restraint spec). Rear marking plates stay clear.",
    scene: "a plain white curtain-side semi-trailer behind a tractor unit at a motorway rest area on a German autobahn",
    spot: "the long side curtain of the trailer",
  },
  {
    cc: "IN", district: "Koramangala", city: "Bengaluru", lat: 12.935, lng: 77.624,
    category: "car", title: "Hatchback on the Koramangala–Whitefield commute", price: 4000, note: "per month",
    panels: "doors,boot,magnets", area: "Koramangala to Whitefield on weekdays, Indiranagar at weekends", km: 450, w: 1.2, h: 0.6,
    desc: "Small white hatchback I commute in every weekday through the Outer Ring Road traffic. Doors and boot lid available for vinyl or magnetic signs. Rear window stays clear.",
    scene: "a small white hatchback car in light city traffic on a tree-lined Bengaluru road with auto-rickshaws nearby",
    spot: "the rear passenger door",
  },
  {
    cc: "JP", district: "Higashiosaka", city: "Osaka", lat: 34.679, lng: 135.601,
    category: "truck", title: "2-tonne box truck on daily Osaka deliveries", price: 40000, note: "per month",
    panels: "sides,boot", area: "Higashiosaka, Namba and Umeda delivery rounds, six days a week", km: 800, w: 4.2, h: 1.8,
    desc: "Aluminium box truck doing furniture deliveries around central Osaka. Both box sides and the rear doors are flat and clean, ready for printed panels.",
    scene: "a white 2-tonne aluminium box truck parked on a narrow Osaka street lined with small shops",
    spot: "the side of the cargo box",
  },
  {
    cc: "GB", district: "Salford", city: "Greater Manchester", lat: 53.488, lng: -2.29,
    category: "van", title: "Long-wheelbase panel van, available for a full wrap", price: 280, note: "per month, 12 month minimum",
    panels: "sides,boot,rear_window,full_wrap", area: "Salford, Manchester city centre and the M60 ring, weekdays", km: 700, w: 3.4, h: 1.4,
    desc: "White LWB van I use for parcel and courier work. Parked on busy streets several times an hour. Available for a full or half wrap, with artwork approved by me.",
    scene: "a plain white long-wheelbase panel van parked on a red-brick street in Salford with terraced houses",
    spot: "the large side panel of the van",
  },
  {
    cc: "FR", district: "Croix-Rousse", city: "Lyon", lat: 45.774, lng: 4.832,
    category: "trailer", title: "Crêpe trailer at Lyon markets and festivals", price: 200, note: "per month",
    panels: "sides", area: "Croix-Rousse and Saint-Antoine markets, summer festivals around Lyon", km: 120, w: 2.0, h: 1.0,
    desc: "Working food trailer that sets up at three markets a week. Customers queue right beside it, so the side panel under the serving hatch gets a long, close look.",
    scene: "a small white food trailer with its serving hatch open at a busy outdoor market in Lyon",
    spot: "the side panel below the serving hatch",
  },
  {
    cc: "IT", district: "Navigli", city: "Milan", lat: 45.452, lng: 9.176,
    category: "car", title: "Compact sedan, Milan city driving every day", price: 120, note: "per month",
    panels: "doors,magnets", area: "Navigli, Porta Romana and the city centre for sales calls", km: 350, w: 1.0, h: 0.5,
    desc: "Silver compact sedan I drive around Milan for sales visits, parked on busy shopping streets most afternoons. Front doors available for decals or magnetic signs.",
    scene: "a clean silver compact sedan parked beside a canal in Milan's Navigli district",
    spot: "the front passenger door",
  },
  {
    cc: "CA", district: "Leslieville", city: "Toronto", lat: 43.663, lng: -79.332,
    category: "car", title: "Family SUV, open to a full wrap", price: 350, note: "per month, advertiser pays wrap and removal",
    panels: "doors,boot,full_wrap", area: "East Toronto, the Gardiner and the DVP; school and sports runs", km: 500, w: null, h: null,
    desc: "Grey mid-size SUV doing school runs, weekend sports and a downtown commute. Happy to take a full wrap from a professional installer. Rear window stays see-through.",
    scene: "a grey mid-size SUV parked on a residential Toronto street with brick houses and autumn trees",
    spot: "the side doors of the SUV",
  },
  {
    cc: "BR", district: "Mooca", city: "São Paulo", lat: -23.559, lng: -46.599,
    category: "truck", title: "Box truck on São Paulo supermarket deliveries", price: 1800, note: "per month",
    panels: "sides,boot", area: "Mooca, Avenida Paulista and the Marginal Tietê, Monday to Saturday", km: 1100, w: 5.0, h: 2.2,
    desc: "Rigid box truck doing daily deliveries to supermarkets across São Paulo. Spends hours in traffic on the Marginais. Both box sides and the rear doors available.",
    scene: "a white rigid box truck in daytime traffic on a wide São Paulo avenue with tall buildings behind",
    spot: "the side of the cargo box",
  },
  {
    cc: "ES", district: "Santa Cruz", city: "Seville", lat: 37.386, lng: -5.991,
    category: "other_vehicle", title: "Electric tour tuk-tuk in the old town", price: 150, note: "per month",
    panels: "sides,boot", area: "Seville old town, Plaza de España and the river, all day", km: 250, w: 0.8, h: 0.5,
    desc: "Electric tuk-tuk taking tourists around Seville's old town, photographed constantly. The rear panel and side skirts are free for small ads that suit visitors.",
    scene: "a white electric tour tuk-tuk on a sunny cobbled street in Seville's old town with orange trees",
    spot: "the rear panel of the tuk-tuk",
  },
  {
    cc: "MX", district: "Zapopan", city: "Guadalajara", lat: 20.721, lng: -103.391,
    category: "van", title: "Cargo van on Guadalajara service calls", price: 3500, note: "per month",
    panels: "sides,boot,rear_window", area: "Zapopan, Providencia and central Guadalajara on weekdays", km: 600, w: 2.6, h: 1.1,
    desc: "White cargo van I drive for air-conditioning installs. Parked outside homes and businesses across the city every day. Sides and rear doors available.",
    scene: "a white cargo van parked on a colourful street in Guadalajara with bougainvillea on the walls",
    spot: "the side panel of the van",
  },
  {
    cc: "AU", district: "Caloundra", city: "Sunshine Coast, Queensland", lat: -26.803, lng: 153.121,
    category: "caravan", title: "Off-road caravan touring the east coast", price: 200, note: "per month, best over school holidays",
    panels: "sides,boot", area: "Bruce Highway and the Pacific Coast, Cairns to Byron Bay, plus caravan parks", km: 1500, w: 4.0, h: 1.2,
    desc: "Big white off-road caravan we tow up and down the Queensland coast most of the year. Seen at caravan parks, servos and beach car parks. The flat side walls and rear are available.",
    scene: "a white off-road caravan hitched to a four-wheel drive at a coastal caravan park with palm trees",
    spot: "the long side wall of the caravan",
  },
];

export const EXAMPLE_LISTINGS = DATA.map((d) => ({ key: `EXV-${d.cc}`, ...d }));

// Prompt for an AI image generator (e.g. Nano Banana) for one example. The
// outline echoes the Frontage logo: a frame of thick dashes with solid
// corners, showing exactly where the ad could go.
export function imagePrompt(ex, countryLabel) {
  return `Photorealistic smartphone photo, landscape 4:3, of ${ex.scene}, in ${ex.district}, ${ex.city}, ${countryLabel}. On ${ex.spot} there is a bold dashed rectangular outline in bright orange (#FF6B35) — thick, evenly spaced dashes with solid right-angle corners, like a placeholder frame — marking exactly where an advert could go; inside the frame the surface is clean and blank. The outline follows the panel's shape and perspective as if it were a sticker on the vehicle. Natural daylight, realistic everyday setting, eye-level three-quarter view. Number plate unreadable. No text, no logos, no manufacturer badges, no brand names, no readable signs, no recognisable faces.`;
}
