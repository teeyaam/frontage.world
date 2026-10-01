// Frontage's labelled example listings: three per market, showing what a
// finished listing looks like. They are always badged "Example", can't be
// messaged, never expire and sort after real listings (see lib/db.js).
//
// Locations are district-level only (no street addresses), so no real
// property is tied to a made-up listing. Prices are illustrative monthly
// figures in each country's currency. Each entry's `scene` feeds the image
// prompt (imagePrompt below) used to generate its photo; the admin uploads
// the image at /admin/examples as <key>.jpg, e.g. EX-JP-2.jpg.
//
// Fields: cc, district, city, lat/lng (approximate district centre),
// category, title, price, note, w/h (metres, optional), desc, scene.

const E = (cc, district, city, lat, lng, category, title, price, note, w, h, desc, scene) => ({ cc, district, city, lat, lng, category, title, price, note, w, h, desc, scene });

const DATA = [
  // ---------- Australia (AUD) ----------
  E("AU", "Fitzroy", "Melbourne", -37.7986, 144.9784, "wall", "Laneway side wall off a busy café strip", 650, "per month, 3 month minimum", 6, 4,
    "Rendered side wall facing a laneway that's full of foot traffic from the cafés and bars around the corner. Smooth surface, ready for a paste-up or a painted mural. Morning sun, lit by a street light at night.",
    "a smooth cream-rendered side wall of a two-storey brick terrace in an inner-city laneway, with café tables and passers-by nearby"),
  E("AU", "Manly", "Sydney", -33.7969, 151.2840, "window", "Corner café window near the ferry", 380, "per month", 2.4, 1.8,
    "Big corner window on the main walk between the ferry and the beach. Space for a decal or poster facing the footpath, visible to queues for coffee all morning.",
    "a large clean corner café window on a sunny beachside street, with a few outdoor stools and the footpath in front"),
  E("AU", "Toowoomba", "Queensland", -27.5598, 151.9507, "fence", "Highway-facing farm fence on the town approach", 140, "per month, 6 month minimum", 20, 1.5,
    "Long timber-and-wire farm fence running beside the highway into town. Drivers see it for several seconds at 80km/h. Suits a banner or a row of corflute signs.",
    "a long timber post-and-rail farm fence beside a rural highway with dry grass paddocks and a big sky"),

  // ---------- New Zealand (NZD) ----------
  E("NZ", "Ponsonby", "Auckland", -36.8560, 174.7460, "wall", "Brick side wall on the main road", 700, "per month", 5, 3.5,
    "Painted brick side wall facing the main shopping road, right by a pedestrian crossing. People wait here at the lights. Owner can arrange a painter or you supply a vinyl.",
    "a painted white brick side wall of a corner shop on a busy suburban high street with a pedestrian crossing"),
  E("NZ", "Te Aro", "Wellington", -41.2930, 174.7760, "window", "Shopfront window on a pedestrian street", 350, "per month", 3, 2,
    "Shopfront window on a busy pedestrian street full of students and office workers. Shop's open seven days and the window is lit until 9pm.",
    "a wide clean shopfront window on a colourful pedestrian street with people walking past"),
  E("NZ", "Riccarton", "Christchurch", -43.5310, 172.6000, "vehicle", "Tradie van available for a full wrap", 280, "per month, 12 month minimum", null, null,
    "White long-wheelbase van that drives the city every weekday for building jobs and parks outside sites all day. Available for a full or half wrap, with artwork approval by the owner.",
    "a plain white long-wheelbase work van parked on a suburban street outside a house under construction"),

  // ---------- United States (USD) ----------
  E("US", "Williamsburg", "Brooklyn, New York", 40.7140, -73.9590, "wall", "Painted brick wall facing a busy corner", 2400, "per month, 3 month minimum", 9, 6,
    "Big flat brick wall facing a busy corner, near the subway and a row of bars and shops. A hand-painted mural spot that gets photographed a lot. Advertiser covers painting and any permits.",
    "a large flat painted brick wall on the side of a three-storey building at a busy urban street corner"),
  E("US", "Silver Lake", "Los Angeles", 34.0870, -118.2700, "fence", "Corner lot fence on a busy boulevard", 450, "per month", 12, 1.8,
    "Wooden fence along a corner lot on a busy boulevard, with stop-and-go traffic and lots of people walking dogs. Good for a long banner.",
    "a long horizontal wooden slat fence along a sunny corner lot on a busy Los Angeles boulevard with palm trees"),
  E("US", "South Congress", "Austin", 30.2490, -97.7500, "digital_screen", "Screen in a coffee shop window", 300, "per month, loop shared with 3 others", null, null,
    "A 55-inch screen facing the street from inside a busy coffee shop window. Your 15-second slide runs in a loop with three other advertisers, 7am to 9pm.",
    "a large blank digital screen mounted inside a coffee shop window facing a lively street with string lights"),

  // ---------- United Kingdom (GBP) ----------
  E("GB", "Shoreditch", "London", 51.5260, -0.0780, "wall", "Gable end wall near the Overground", 1800, "per month, 3 month minimum", 8, 10,
    "Tall gable end wall visible from the street and the railway viaduct. Shoreditch footfall all week. Advertiser handles design, painting and planning consent.",
    "a tall blank brick gable end wall of a Victorian building next to a railway viaduct in east London"),
  E("GB", "Northern Quarter", "Manchester", 53.4840, -2.2360, "window", "Record shop window on a busy street", 250, "per month", 2.5, 2,
    "Large window in an independent record shop on one of the busiest streets in the Northern Quarter. Great for gigs, festivals and local brands.",
    "a clean shop window of an independent record shop on a red-brick street in Manchester's Northern Quarter"),
  E("GB", "Clifton", "Bristol", 51.4560, -2.6200, "indoor", "Poster frames in a busy gym", 120, "per month, 2 frames", null, null,
    "Two A1 poster frames by the reception and water station in a busy independent gym, about 900 members. Ideal for physios, food and fitness brands.",
    "two empty A1 poster frames on a wall next to a reception desk and water fountain inside a bright modern gym"),

  // ---------- Canada (CAD) ----------
  E("CA", "Queen West", "Toronto", 43.6470, -79.4060, "wall", "Side wall above a corner store", 1200, "per month", 6, 5,
    "Flat side wall above a corner store, facing a streetcar stop on a busy shopping strip. People wait right in front of it.",
    "a flat side wall above a corner convenience store next to a streetcar stop on a Toronto shopping street"),
  E("CA", "Kitsilano", "Vancouver", 49.2680, -123.1550, "window", "Bike shop window on a busy avenue", 400, "per month", 3, 2.2,
    "Big front window of a bike shop on a busy avenue near the beach. Lots of cyclists, runners and families walking by every day.",
    "a large bike shop front window on a leafy Vancouver avenue with bicycles parked outside"),
  E("CA", "Le Plateau", "Montréal", 45.5230, -73.5810, "fence", "Backyard fence facing a cycle path", 200, "per month", 10, 1.8,
    "Wooden backyard fence along one of the city's busiest cycle paths. Hundreds of cyclists pass every hour in summer.",
    "a long wooden backyard fence beside a busy urban cycle path lined with trees in Montreal"),

  // ---------- Ireland (EUR) ----------
  E("IE", "Temple Bar", "Dublin", 53.3450, -6.2650, "window", "Pub side window on a cobbled lane", 450, "per month", 2, 1.5,
    "Side window of a pub on a cobbled lane packed with visitors day and night. Suits tours, events and food and drink brands.",
    "a pub side window with a dark painted frame on a cobbled lane in Dublin's old town"),
  E("IE", "City Centre", "Galway", 53.2720, -9.0530, "wall", "Gable wall near the main shopping street", 700, "per month", 6, 7,
    "Plain gable wall one street back from the main pedestrian shopping street. Visible from the corner and the car park opposite.",
    "a plain painted gable end wall of a three-storey building in a small Irish city centre street"),
  E("IE", "Douglas", "Cork", 51.8770, -8.4350, "vehicle", "Food truck side panels", 300, "per month", null, null,
    "Busy coffee and crêpe truck that trades at markets and festivals around the county most weekends. Both side panels available below the serving hatch.",
    "a small food truck with plain side panels parked at an outdoor weekend market"),

  // ---------- Germany (EUR) ----------
  E("DE", "Kreuzberg", "Berlin", 52.4990, 13.4180, "wall", "Firewall facing the elevated U-Bahn", 2200, "per month, 6 month minimum", 10, 14,
    "Large windowless firewall facing the elevated U-Bahn line and a busy junction. Seen from trains, bikes and cars. Mural or mesh banner, advertiser handles permits.",
    "a huge windowless firewall of a Berlin apartment building beside an elevated U-Bahn track"),
  E("DE", "Sternschanze", "Hamburg", 53.5630, 9.9630, "window", "Corner kiosk window", 300, "per month", 2, 1.5,
    "Corner kiosk window in a busy nightlife area. Open late, with people buying drinks and snacks all evening.",
    "a corner kiosk window on a lively Hamburg street with old apartment buildings"),
  E("DE", "Maxvorstadt", "Munich", 48.1500, 11.5700, "digital_screen", "Screen in a café near the university", 350, "per month", null, null,
    "Screen above the counter in a busy student café near the university. Slides run in a loop all day; great for events, apps and local services.",
    "a blank digital screen mounted above the counter of a bright busy student café"),

  // ---------- France (EUR) ----------
  E("FR", "Le Marais", "Paris", 48.8590, 2.3590, "window", "Boutique window on a busy rue", 900, "per month", 2.5, 2.4,
    "Elegant boutique window on one of the Marais' busiest shopping streets. Weekend foot traffic is heavy. Suits fashion, beauty and culture.",
    "an elegant empty boutique window with a dark green wooden frame on a narrow Paris shopping street"),
  E("FR", "Croix-Rousse", "Lyon", 45.7740, 4.8320, "wall", "Gable wall above a market square", 1100, "per month", 7, 9,
    "Tall gable wall overlooking a square that hosts a daily market. Visible across the whole square.",
    "a tall pastel gable wall of an old building overlooking a French market square"),
  E("FR", "Les Chartrons", "Bordeaux", 44.8540, -0.5700, "indoor", "Poster space in a wine bar", 180, "per month", null, null,
    "Poster space by the bar in a popular wine bar, full most evenings with locals and visitors. Great for wineries, events and food producers.",
    "an empty framed poster space on a stone wall beside the bar of a cosy French wine bar"),

  // ---------- Netherlands (EUR) ----------
  E("NL", "De Pijp", "Amsterdam", 52.3550, 4.8950, "window", "Canal-side café window", 500, "per month", 2.5, 1.8,
    "Large window of a café on a canal corner, with boats, bikes and walkers passing all day.",
    "a large café window on a canal corner in Amsterdam with bicycles parked outside"),
  E("NL", "Centrum", "Rotterdam", 51.9200, 4.4800, "digital_screen", "Street-facing screen in a phone shop", 600, "per month", null, null,
    "Bright screen in a phone repair shop window on a busy shopping street, facing the pavement. Runs from 9am to 9pm.",
    "a bright blank digital screen inside a modern shop window on a busy Rotterdam shopping street"),
  E("NL", "Lombok", "Utrecht", 52.0900, 5.1000, "fence", "Site fence along a busy bike route", 450, "per month, until the build ends", 30, 2,
    "Long construction hoarding along one of the city's busiest bike routes, in place for at least a year. Ideal for a long printed banner.",
    "a long plain construction hoarding fence beside a busy Dutch bike path"),

  // ---------- Belgium (EUR) ----------
  E("BE", "Ixelles", "Brussels", 50.8270, 4.3720, "wall", "Side wall near a tram stop", 900, "per month", 6, 8,
    "Side wall of an apartment building right by a busy tram stop and a row of cafés.",
    "a plain side wall of an apartment building next to a tram stop in Brussels"),
  E("BE", "Het Zuid", "Antwerp", 51.2070, 4.3940, "window", "Gallery window on a corner", 350, "per month", 3, 2.5,
    "Corner window of a small gallery in a lively neighbourhood of restaurants and museums.",
    "a corner gallery window on a cobbled street in Antwerp with old townhouses"),
  E("BE", "Centrum", "Ghent", 51.0540, 3.7250, "vehicle", "Cargo bike with side panels", 150, "per month", null, null,
    "Cargo bike that delivers groceries around the city centre every day. Both side panels of the box are available.",
    "a cargo bike with a plain wooden box parked on a cobbled street in Ghent"),

  // ---------- Austria (EUR) ----------
  E("AT", "Neubau", "Vienna", 48.2020, 16.3490, "window", "Concept store window on a busy shopping street", 600, "per month", 3, 2.5,
    "Wide window of a concept store on one of Vienna's busiest shopping streets.",
    "a wide clean concept store window on an elegant Vienna shopping street"),
  E("AT", "Lend", "Graz", 47.0730, 15.4320, "wall", "Side wall facing a tram line", 800, "per month", 6, 6,
    "Plain side wall facing a tram line and a busy junction in a creative neighbourhood.",
    "a plain side wall of an old building beside a tram line in a small Austrian city"),
  E("AT", "Pradl", "Innsbruck", 47.2630, 11.4100, "billboard", "Roadside billboard on the way to the ski lifts", 1200, "per month, winter season", 6, 3,
    "Free-standing billboard frame on the main road towards the ski lifts, with mountains behind it. Busy every winter weekend.",
    "an empty roadside billboard frame with snowy Alpine mountains behind it"),

  // ---------- Switzerland (CHF) ----------
  E("CH", "Kreis 4", "Zürich", 47.3770, 8.5250, "wall", "Facade above a bar strip", 2500, "per month", 7, 6,
    "Upper facade above a strip of bars and restaurants. Busy every evening and on weekends.",
    "a plain upper facade of a building above a row of bars on a Zurich street"),
  E("CH", "Plainpalais", "Geneva", 46.1980, 6.1420, "window", "Bookshop window near the market", 700, "per month", 2.5, 2,
    "Bookshop window beside a large square that hosts flea markets and fairs.",
    "a bookshop window with a wooden frame on a street beside a large square in Geneva"),
  E("CH", "Kleinbasel", "Basel", 47.5620, 7.5950, "digital_screen", "Screen in a co-working lobby", 450, "per month", null, null,
    "Screen in the lobby of a busy co-working space with about 300 members. Great for B2B services and local events.",
    "a blank digital screen on the wall of a bright modern co-working lobby"),

  // ---------- Denmark (DKK) ----------
  E("DK", "Nørrebro", "Copenhagen", 55.6930, 12.5480, "wall", "Gable wall above a busy bike lane", 6500, "per month", 7, 9,
    "Gable wall facing one of the busiest bike lanes in the city. Thousands of cyclists every rush hour.",
    "a tall plain gable wall above a busy Copenhagen bike lane full of cyclists"),
  E("DK", "Latinerkvarteret", "Aarhus", 56.1590, 10.2100, "window", "Café window on a pedestrian street", 2000, "per month", 2.5, 1.8,
    "Café window on a narrow pedestrian street in the old town, busy with students and shoppers.",
    "a café window on a narrow cobbled pedestrian street with colourful old houses in Aarhus"),
  E("DK", "Centrum", "Odense", 55.3960, 10.3880, "vehicle", "Electrician's van wrap", 1500, "per month", null, null,
    "Electrician's van that drives all over Funen on weekdays. Available for a full wrap.",
    "a plain white electrician's van parked on a quiet Danish residential street"),

  // ---------- Sweden (SEK) ----------
  E("SE", "Södermalm", "Stockholm", 59.3150, 18.0710, "wall", "Courtyard wall facing a busy street", 9500, "per month", 6, 8,
    "Plain wall facing a busy shopping street, visible from the T-bana entrance.",
    "a plain wall of an old apartment building facing a busy shopping street in Stockholm"),
  E("SE", "Haga", "Gothenburg", 57.6990, 11.9540, "window", "Bakery window in the old town", 3000, "per month", 2, 1.5,
    "Bakery window on a pedestrian street that's busy all weekend.",
    "a bakery window with a painted wooden frame on a cobbled pedestrian street in Gothenburg"),
  E("SE", "Möllevången", "Malmö", 55.5900, 13.0050, "fence", "Fence around a community garden on a corner", 1200, "per month", 15, 1.6,
    "Fence along a busy corner by the market square. Suits banners for local events and businesses.",
    "a wooden fence around a small community garden on a city street corner in Malmö"),

  // ---------- Norway (NOK) ----------
  E("NO", "Grünerløkka", "Oslo", 59.9230, 10.7590, "wall", "Gable wall by a park", 10000, "per month", 7, 9,
    "Tall gable wall overlooking a popular park and a tram stop.",
    "a tall plain gable wall of an apartment building next to a park and tram stop in Oslo"),
  E("NO", "Sentrum", "Bergen", 60.3940, 5.3240, "window", "Shop window near the fish market", 3500, "per month", 2.5, 2,
    "Shop window on the main walk between the harbour and the fish market. Very busy with visitors in summer.",
    "a shop window on a harbour-side street in Bergen with colourful wooden buildings"),
  E("NO", "Midtbyen", "Trondheim", 63.4300, 10.3950, "digital_screen", "Screen in a student bar", 2500, "per month", null, null,
    "Screen by the bar in a busy student pub, running a loop of slides every evening.",
    "a blank digital screen on the wall beside the bar of a cosy Scandinavian student pub"),

  // ---------- Finland (EUR) ----------
  E("FI", "Kallio", "Helsinki", 60.1840, 24.9500, "wall", "Side wall on a tram corner", 900, "per month", 6, 8,
    "Side wall on a corner where two tram lines meet, in a busy neighbourhood of bars and cafés.",
    "a plain side wall of an apartment building on a tram corner in Helsinki"),
  E("FI", "Keskusta", "Tampere", 61.4980, 23.7610, "window", "Shop window on the main street", 300, "per month", 2.5, 2,
    "Shop window on the city's main shopping street, between the station and the square.",
    "a clean shop window on a wide Finnish main street"),
  E("FI", "Keskusta", "Turku", 60.4510, 22.2670, "indoor", "Poster frames in a public sauna lobby", 150, "per month, 2 frames", null, null,
    "Two poster frames in the lobby of a busy public sauna by the river. Visitors wait here before and after.",
    "two empty poster frames on a timber wall in the lobby of a Finnish public sauna"),

  // ---------- Poland (PLN) ----------
  E("PL", "Kazimierz", "Kraków", 50.0510, 19.9450, "wall", "Side wall above a food truck square", 3500, "per month", 6, 8,
    "Side wall overlooking a square of food trucks that's busy every evening.",
    "a weathered plain side wall above a small square with food trucks in Kraków"),
  E("PL", "Śródmieście", "Warsaw", 52.2300, 21.0120, "window", "Corner shop window on a busy avenue", 2000, "per month", 3, 2.2,
    "Corner shop window on a busy avenue near the central station.",
    "a large corner shop window on a busy Warsaw avenue"),
  E("PL", "Krzyki", "Wrocław", 51.0800, 17.0200, "billboard", "Roadside billboard on a ring road", 2500, "per month", 6, 3,
    "Free-standing billboard frame on a busy ring road, lit at night.",
    "an empty free-standing billboard frame beside a busy city ring road"),

  // ---------- Portugal (EUR) ----------
  E("PT", "Bairro Alto", "Lisbon", 38.7130, -9.1450, "wall", "Plain side wall on a tram route", 800, "per month", 5, 7,
    "Plain painted side wall on a steep street on a tram route. Busy with visitors day and night.",
    "a plain painted side wall of an old building on a steep Lisbon street with tram tracks"),
  E("PT", "Baixa", "Porto", 41.1470, -8.6110, "window", "Café window on a shopping street", 400, "per month", 2.5, 2,
    "Café window on a busy shopping street close to the main square.",
    "a café window with a wooden frame on a sloping shopping street in Porto"),
  E("PT", "Sé", "Faro", 37.0150, -7.9350, "vehicle", "Beach shuttle van", 300, "per month, summer season", null, null,
    "Shuttle van between the town and the beaches, running all summer. Both sides available.",
    "a plain white minivan parked near palm trees in a sunny southern Portuguese town"),

  // ---------- Spain (EUR) ----------
  E("ES", "Malasaña", "Madrid", 40.4260, -3.7040, "wall", "Side wall on a lively plaza", 1200, "per month", 6, 8,
    "Side wall overlooking a busy plaza full of terraces in the evenings.",
    "a plain ochre side wall of a building overlooking a Madrid plaza with café terraces"),
  E("ES", "Gràcia", "Barcelona", 41.4030, 2.1560, "window", "Boutique window on a busy street", 500, "per month", 2.5, 2.2,
    "Boutique window on one of the neighbourhood's busiest shopping streets.",
    "a boutique window on a narrow sunny Barcelona street with balconies above"),
  E("ES", "Ruzafa", "Valencia", 39.4620, -0.3740, "digital_screen", "Screen in a busy padel club", 400, "per month", null, null,
    "Screen by the courts in a padel club with over 1,000 members. Great for sports, health and local brands.",
    "a blank digital screen mounted on a wall beside indoor padel courts"),

  // ---------- Italy (EUR) ----------
  E("IT", "Navigli", "Milan", 45.4520, 9.1770, "wall", "Wall above a canal-side bar strip", 1500, "per month", 6, 7,
    "Wall above a strip of bars along the canal. Packed every evening for aperitivo.",
    "a plain wall of an old building above bars along a canal in Milan"),
  E("IT", "Trastevere", "Rome", 41.8890, 12.4700, "window", "Shop window on a cobbled lane", 600, "per month", 2, 2,
    "Shop window on a cobbled lane, busy with visitors and locals from morning till late.",
    "a shop window on a narrow cobbled lane in Rome with ivy and warm-coloured walls"),
  E("IT", "Centro", "Bologna", 44.4940, 11.3430, "vehicle", "Delivery scooter boxes", 200, "per month, 3 scooters", null, null,
    "Boxes on three delivery scooters that ride all over the city centre every day.",
    "three delivery scooters with plain top boxes parked under a porticoed street in Bologna"),

  // ---------- Japan (JPY) ----------
  E("JP", "Shimokitazawa", "Tokyo", 35.6610, 139.6680, "wall", "Side wall by the station shopping streets", 120000, "per month", 5, 6,
    "Side wall facing a narrow shopping street near the station. Very busy with young shoppers.",
    "a plain side wall of a small building on a narrow Tokyo shopping street"),
  E("JP", "Namba", "Osaka", 34.6660, 135.5010, "window", "Shop window in a covered arcade", 60000, "per month", 2.5, 2,
    "Shop window in a covered shopping arcade with heavy foot traffic all day.",
    "a clean shop window inside a busy covered shopping arcade in Osaka"),
  E("JP", "Tenjin", "Fukuoka", 33.5910, 130.3990, "digital_screen", "Screen in a café window", 80000, "per month", null, null,
    "Street-facing screen in a café window near the main shopping area.",
    "a blank digital screen in a café window on a modern Japanese street"),

  // ---------- South Korea (KRW) ----------
  E("KR", "Hongdae", "Seoul", 37.5560, 126.9230, "wall", "Wall on a busy nightlife street", 1500000, "per month", 5, 6,
    "Wall facing a street of clubs, cafés and street performers. Busy every night.",
    "a plain side wall of a building on a lively Seoul street with cafés"),
  E("KR", "Seomyeon", "Busan", 35.1580, 129.0600, "window", "Café window near the subway", 600000, "per month", 2.5, 2,
    "Café window by a subway exit in a busy shopping district.",
    "a large café window near a subway entrance in Busan"),
  E("KR", "Jung-gu", "Daegu", 35.8690, 128.5940, "vehicle", "Delivery truck side panels", 500000, "per month", null, null,
    "Small delivery truck that does city-wide routes every day. Both side panels available.",
    "a small plain white delivery truck parked on a Korean city street"),

  // ---------- Taiwan (TWD) ----------
  E("TW", "Ximending", "Taipei", 25.0420, 121.5070, "wall", "Wall on a pedestrian shopping street", 40000, "per month", 5, 6,
    "Wall facing a busy pedestrian shopping area that's full every evening and weekend.",
    "a plain side wall on a busy pedestrian shopping street in Taipei"),
  E("TW", "West District", "Taichung", 24.1440, 120.6620, "window", "Tea shop window on a busy road", 12000, "per month", 2.5, 2,
    "Tea shop window on a busy road with scooters and shoppers.",
    "a tea shop window on a busy street in Taichung with scooters parked outside"),
  E("TW", "Xinxing", "Kaohsiung", 22.6310, 120.3040, "digital_screen", "Screen at a bubble tea counter", 8000, "per month", null, null,
    "Screen above a bubble tea counter where customers queue every afternoon.",
    "a blank digital screen above the counter of a bright bubble tea shop"),

  // ---------- Hong Kong (HKD) ----------
  E("HK", "Mong Kok", "Kowloon", 22.3190, 114.1690, "wall", "Facade above a street market", 15000, "per month", 5, 6,
    "Facade above one of the busiest street markets in the city.",
    "a plain facade of a building above a busy street market in Hong Kong"),
  E("HK", "Sheung Wan", "Hong Kong Island", 22.2860, 114.1500, "window", "Shop window on a sloping street", 6000, "per month", 2.5, 2,
    "Shop window on a sloping street of cafés and galleries.",
    "a shop window on a sloping street of cafés and galleries in Hong Kong"),
  E("HK", "Causeway Bay", "Hong Kong Island", 22.2800, 114.1840, "indoor", "Poster frames in a busy gym", 2500, "per month, 2 frames", null, null,
    "Two poster frames by the lockers in a busy gym in a shopping district.",
    "two empty poster frames on a wall beside lockers in a modern gym"),

  // ---------- Singapore (SGD) ----------
  E("SG", "Tiong Bahru", "Singapore", 1.2850, 103.8270, "window", "Café window in a heritage estate", 500, "per month", 2.5, 2,
    "Café window in a popular heritage estate that's busy for brunch every weekend.",
    "a café window in a low-rise art deco building in Singapore"),
  E("SG", "Joo Chiat", "Singapore", 1.3120, 103.9020, "wall", "Shophouse side wall", 1200, "per month", 5, 6,
    "Side wall of a shophouse on a busy road. The advertiser handles any signage approvals.",
    "a plain side wall of a colourful shophouse on a Singapore street"),
  E("SG", "Jurong East", "Singapore", 1.3330, 103.7420, "digital_screen", "Screen in a tuition centre lobby", 350, "per month", null, null,
    "Screen in the lobby of a tuition centre where parents wait for their kids after school.",
    "a blank digital screen on a wall in a bright tuition centre waiting area"),

  // ---------- India (INR) ----------
  E("IN", "Bandra West", "Mumbai", 19.0600, 72.8360, "wall", "Wall on a busy road near the station", 45000, "per month", 6, 5,
    "Wall facing a busy road with heavy traffic and foot traffic near the station.",
    "a plain painted wall facing a busy road in Mumbai"),
  E("IN", "Indiranagar", "Bengaluru", 12.9720, 77.6410, "window", "Café window on a busy road", 15000, "per month", 2.5, 2,
    "Café window on a busy road of restaurants and shops.",
    "a café window on a leafy busy road in Bengaluru"),
  E("IN", "Saket", "New Delhi", 28.5240, 77.2060, "vehicle", "Auto-rickshaw back panel", 2500, "per month", null, null,
    "Back panel of an auto-rickshaw that works the city every day.",
    "the plain back panel of a green and yellow auto-rickshaw on a Delhi street"),

  // ---------- United Arab Emirates (AED) ----------
  E("AE", "Al Quoz", "Dubai", 25.1380, 55.2310, "wall", "Warehouse wall in the arts district", 6000, "per month", 10, 6,
    "Warehouse wall in an arts district with galleries, cafés and studios.",
    "a plain warehouse wall in a desert-toned arts district in Dubai"),
  E("AE", "Jumeirah", "Dubai", 25.2050, 55.2470, "window", "Beach café window", 2500, "per month", 3, 2.2,
    "Window of a beach café on a busy beach road.",
    "a café window near the beach in Dubai with palm trees"),
  E("AE", "Khalifa City", "Abu Dhabi", 24.4200, 54.5780, "vehicle", "Delivery van wrap", 1500, "per month", null, null,
    "Delivery van that drives across the city every day.",
    "a plain white delivery van parked in a modern residential area of Abu Dhabi"),

  // ---------- South Africa (ZAR) ----------
  E("ZA", "Maboneng", "Johannesburg", -26.2040, 28.0590, "wall", "Wall in a creative district", 9000, "per month", 8, 6,
    "Wall in a creative district of galleries, studios and weekend markets.",
    "a plain brick wall in a creative urban district in Johannesburg"),
  E("ZA", "Woodstock", "Cape Town", -33.9270, 18.4470, "window", "Café window on a main road", 3500, "per month", 2.5, 2,
    "Café window on a main road with heavy traffic.",
    "a café window on a main road in Cape Town with mountains in the distance"),
  E("ZA", "Morningside", "Durban", -29.8300, 31.0070, "vehicle", "Minibus taxi rear window", 1200, "per month", null, null,
    "Rear window of a minibus taxi on busy city routes.",
    "the plain rear window of a white minibus taxi on a Durban street"),

  // ---------- Brazil (BRL) ----------
  E("BR", "Vila Madalena", "São Paulo", -23.5530, -46.6910, "wall", "Wall on a street-art street", 4500, "per month", 6, 5,
    "Wall in a neighbourhood known for street art, bars and restaurants.",
    "a plain wall on a São Paulo street known for street art"),
  E("BR", "Ipanema", "Rio de Janeiro", -22.9840, -43.2050, "window", "Shop window a block from the beach", 2500, "per month", 2.5, 2,
    "Shop window a block from the beach, on a busy shopping street.",
    "a shop window on a sunny street a block from the beach in Rio de Janeiro"),
  E("BR", "Batel", "Curitiba", -25.4410, -49.2890, "billboard", "Billboard frame on a busy avenue", 3000, "per month", 6, 3,
    "Billboard frame on a busy avenue.",
    "an empty billboard frame beside a busy avenue in Curitiba"),

  // ---------- Mexico (MXN) ----------
  E("MX", "Roma Norte", "Mexico City", 19.4190, -99.1620, "wall", "Wall on a tree-lined avenue", 18000, "per month", 6, 6,
    "Wall on a tree-lined avenue of cafés and galleries.",
    "a plain pastel wall on a leafy avenue in Mexico City"),
  E("MX", "Chapultepec", "Guadalajara", 20.6740, -103.3700, "window", "Café window on a busy avenue", 6000, "per month", 2.5, 2,
    "Café window on a busy avenue with lots of foot traffic.",
    "a café window on a busy avenue in Guadalajara"),
  E("MX", "Centro", "Monterrey", 25.6710, -100.3090, "fence", "Fence along a busy avenue", 4000, "per month", 20, 2,
    "Fence along a busy avenue.",
    "a long plain fence along a busy avenue in Monterrey with mountains behind"),
];

// Stable keys: EX-<country>-<n>, numbered within each country.
const counts = {};
export const EXAMPLE_LISTINGS = DATA.map((d) => {
  counts[d.cc] = (counts[d.cc] || 0) + 1;
  return { key: `EX-${d.cc}-${counts[d.cc]}`, ...d };
});

const SURFACE = { wall: "wall", fence: "fence", window: "window", billboard: "billboard frame", digital_screen: "screen", vehicle: "vehicle's panels", indoor: "poster frames", other: "space" };

// Prompt for an AI image generator (e.g. Nano Banana) for one example.
export function imagePrompt(ex, countryLabel) {
  return `Photorealistic smartphone photo, landscape 4:3, of ${ex.scene}, in ${ex.district}, ${ex.city}, ${countryLabel}. The ${SURFACE[ex.category] || "space"} is clean and blank, clearly ready for an advert. Natural daylight, realistic everyday street context, eye-level angle. No text, no logos, no brand names, no readable signs, no recognisable faces.`;
}
