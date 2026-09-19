/**
 * Satellite geoguess mockup: the target list.
 *
 * Throwaway prototype data. This exists to answer one question, "is a satellite
 * geoguess actually guessable", and nothing in the game imports it. If the
 * mechanic survives the playtest, the shipping version generates this from a
 * seeded city list instead of hand authoring it.
 *
 * Tiers are a guess, not a measurement. The playtest is what corrects them.
 */

export type Tier = "easy" | "medium" | "hard";

export interface Target {
  id: string;
  /** The answer, as shown on reveal. */
  name: string;
  country: string;
  lat: number;
  lon: number;
  tier: Tier;
  /** Zoom that frames the giveaway. The settings drawer shifts every target by the same offset. */
  zoom: number;
  /**
   * The free opening line when the dial asks for one. Orients only: continent,
   * climate, terrain. It must never be enough to name the place on its own.
   */
  opener: string;
  /**
   * A paid intel drop, and a strong one. Most of these are close to decisive by
   * design, which is why they are bought rather than given.
   */
  clue: string;
  /** Third intel drop: the country, plus the first letter of the answer. */
  lastResort?: string;
  /**
   * Optional intel rung: a structure in frame, pinned and described. The
   * description never names the city or the country, so it stays a clue.
   */
  landmark?: { name: string; lat: number; lon: number };
  /** Lane mode: three wrong cities that should be genuinely tempting. */
  decoys: [string, string, string];
  /** Typed mode: lowercase substrings that count as correct. */
  accept: string[];
  fact: string;
}

export const TARGETS: Target[] = [
  {
    id: "palm",
    name: "Dubai",
    country: "United Arab Emirates",
    lat: 25.117,
    lon: 55.138,
    tier: "easy",
    zoom: 13,
    opener: "Hot desert coast. Low, flat, and conspicuously new.",
    clue: "A desert coast on the Persian Gulf. Everything you can see was built since 2001.",
    landmark: { name: "Resort at the crown of a man-made frond", lat: 25.1304, lon: 55.1172 },
    decoys: ["Doha", "Abu Dhabi", "Jeddah"],
    accept: ["dubai"],
    fact: "Palm Jumeirah used 94 million cubic metres of dredged sand and no steel reinforcement in its breakwater.",
  },
  {
    id: "venice",
    name: "Venice",
    country: "Italy",
    lat: 45.437,
    lon: 12.335,
    tier: "easy",
    zoom: 13,
    opener: "Southern Europe, built out over shallow water.",
    clue: "A lagoon city in southern Europe, built on 118 islands in a shallow tidal basin.",
    landmark: { name: "Bell tower on the waterfront square", lat: 45.4341, lon: 12.3388 },
    decoys: ["Amsterdam", "Dubrovnik", "Trieste"],
    accept: ["venice", "venezia"],
    fact: "Venice stands on millions of alder piles driven into the mud, which petrified rather than rotted underwater.",
  },
  {
    id: "manhattan",
    name: "New York",
    country: "United States",
    lat: 40.782,
    lon: -73.965,
    tier: "easy",
    zoom: 13,
    opener: "North Atlantic seaboard. Dense, and gridded throughout.",
    clue: "A rectangle of green cut into a dense grid on a North Atlantic island.",
    landmark: { name: "Reservoir, drained of its role in 1993", lat: 40.7857, lon: -73.9615 },
    decoys: ["Chicago", "Boston", "Philadelphia"],
    accept: ["new york", "nyc", "manhattan"],
    fact: "Central Park is entirely artificial. Its ponds, hills and woods were designed and built between 1858 and 1876.",
  },
  {
    id: "giza",
    name: "Cairo",
    country: "Egypt",
    lat: 29.977,
    lon: 31.132,
    tier: "easy",
    zoom: 14,
    opener: "North Africa. Hot, dry, and abruptly irrigated.",
    clue: "Where the desert stops dead against irrigated land, in North Africa.",
    landmark: { name: "Tomb complex, c.2560 BC", lat: 29.9792, lon: 31.1342 },
    decoys: ["Khartoum", "Luxor", "Tripoli"],
    accept: ["cairo", "giza", "el giza"],
    fact: "The Giza pyramids sit on the exact edge of the fertile Nile floodplain, on rock rather than farmland.",
  },
  {
    id: "uluru",
    name: "Uluru",
    country: "Australia",
    lat: -25.345,
    lon: 131.036,
    tier: "easy",
    zoom: 13,
    opener: "Southern hemisphere, arid interior. Nothing for miles.",
    clue: "Red arid interior of a southern hemisphere continent. Nearest town is 450 km away.",
    decoys: ["Kata Tjuta", "Kings Canyon", "Mount Augustus"],
    accept: ["uluru", "ayers rock", "ayers"],
    fact: "Most of Uluru is underground. The visible rock is the tip of a slab extending several kilometres down.",
  },

  {
    id: "barcelona",
    name: "Barcelona",
    country: "Spain",
    lat: 41.392,
    lon: 2.165,
    tier: "medium",
    zoom: 15,
    opener: "Mediterranean coast, tightly and regularly gridded.",
    clue: "A Mediterranean port. The grid has chamfered corners on every single block.",
    landmark: { name: "Undulating stone apartment block, 1912", lat: 41.3953, lon: 2.1619 },
    decoys: ["Valencia", "Marseille", "Turin"],
    accept: ["barcelona"],
    fact: "Cerda's Eixample cut the corner off every block so horse trams could turn. The octagons are visible from orbit.",
  },
  {
    id: "brasilia",
    name: "Brasilia",
    country: "Brazil",
    lat: -15.794,
    lon: -47.882,
    tier: "medium",
    zoom: 12,
    opener: "Inland South America, on a high open plateau.",
    clue: "A capital built from nothing in 41 months, on an empty inland plateau.",
    landmark: { name: "Twin towers and two bowls, one up one down", lat: -15.7997, lon: -47.8644 },
    decoys: ["Canberra", "Islamabad", "Abuja"],
    accept: ["brasilia", "brasilia df"],
    fact: "The city plan is often read as an aeroplane. Costa said he only meant a cross, the sign of taking possession.",
  },
  {
    id: "amsterdam",
    name: "Amsterdam",
    country: "Netherlands",
    lat: 52.372,
    lon: 4.892,
    tier: "medium",
    zoom: 13,
    opener: "Northern Europe, at sea level, and very wet.",
    clue: "Northern Europe, at sea level. Four concentric canals wrap the old centre.",
    landmark: { name: "National museum with a cycle path through it", lat: 52.36, lon: 4.8852 },
    decoys: ["Hamburg", "Copenhagen", "Bruges"],
    accept: ["amsterdam"],
    fact: "The canal ring was dug as a single 17th century masterplan, then sold off plot by plot to fund itself.",
  },
  {
    id: "sydney",
    name: "Sydney",
    country: "Australia",
    lat: -33.857,
    lon: 151.215,
    tier: "medium",
    zoom: 14,
    opener: "Southern hemisphere. A deep natural harbour.",
    clue: "A drowned river valley on a Pacific coast, in the southern hemisphere.",
    landmark: { name: "Concert hall roofed in precast shells", lat: -33.8568, lon: 151.2153 },
    decoys: ["Auckland", "Wellington", "Brisbane"],
    accept: ["sydney"],
    fact: "Sydney Harbour is a ria, a river valley flooded when sea levels rose after the last ice age.",
  },
  {
    id: "istanbul",
    name: "Istanbul",
    country: "Turkey",
    lat: 41.02,
    lon: 28.975,
    tier: "medium",
    zoom: 13,
    opener: "Eastern Mediterranean, straddling a body of water.",
    clue: "A strait splits this city between two continents.",
    landmark: { name: "Domed basilica, then mosque, 537 AD", lat: 41.0086, lon: 28.9802 },
    decoys: ["Athens", "Odesa", "Thessaloniki"],
    accept: ["istanbul", "constantinople"],
    fact: "About 40,000 ships pass through the Bosphorus each year, three times the traffic of the Suez Canal.",
  },
  {
    id: "capetown",
    name: "Cape Town",
    country: "South Africa",
    lat: -33.925,
    lon: 18.424,
    tier: "medium",
    zoom: 13,
    opener: "Southern hemisphere. A port hemmed in by mountains.",
    clue: "A flat topped mountain pins this port against the sea, near a continent's southern tip.",
    landmark: { name: "Stadium built for the 2010 World Cup", lat: -33.9038, lon: 18.4109 },
    decoys: ["Valparaiso", "Hobart", "Durban"],
    accept: ["cape town", "capetown", "kaapstad"],
    fact: "Table Mountain's summit is roughly 260 million years older than the Himalayas.",
  },
  {
    id: "singapore",
    name: "Singapore",
    country: "Singapore",
    lat: 1.283,
    lon: 103.86,
    tier: "medium",
    zoom: 13,
    opener: "Equatorial South East Asia, on a busy strait.",
    clue: "Equatorial. One of the busiest anchorages on Earth sits just offshore.",
    landmark: { name: "Three towers under one boat-shaped deck", lat: 1.2834, lon: 103.8607 },
    decoys: ["Hong Kong", "Kuala Lumpur", "Jakarta"],
    accept: ["singapore"],
    fact: "A quarter of Singapore's land area did not exist in 1960. It was reclaimed from the sea.",
  },

  {
    id: "mexico",
    name: "Mexico City",
    country: "Mexico",
    lat: 19.432,
    lon: -99.133,
    tier: "hard",
    zoom: 13,
    opener: "North America. High, inland, ringed by mountains.",
    clue: "A high altitude basin in North America, ringed by volcanoes, built on a drained lake.",
    landmark: { name: "Cathedral on a vast bare civic square", lat: 19.4341, lon: -99.1329 },
    decoys: ["Bogota", "Lima", "Guadalajara"],
    accept: ["mexico city", "cdmx", "ciudad de mexico", "mexico df"],
    fact: "The city is sinking up to 50 cm a year as the old lakebed beneath it is pumped dry.",
  },
  {
    id: "mumbai",
    name: "Mumbai",
    country: "India",
    lat: 18.94,
    lon: 72.83,
    tier: "hard",
    zoom: 13,
    opener: "South Asia. A humid coast, extraordinarily dense.",
    clue: "A monsoon coast in South Asia. The peninsula was seven separate islands until the British joined them.",
    landmark: { name: "Gothic revival railway terminus, 1888", lat: 18.9398, lon: 72.8355 },
    decoys: ["Karachi", "Chennai", "Colombo"],
    accept: ["mumbai", "bombay"],
    fact: "Mumbai's seven islands were merged into one landmass by a reclamation programme finished in 1845.",
  },
  {
    id: "tokyo",
    name: "Tokyo",
    country: "Japan",
    lat: 35.659,
    lon: 139.7,
    tier: "hard",
    zoom: 14,
    opener: "East Asia. Coastal, low rise, and enormous.",
    clue: "East Asia. The densest rail network on the planet runs under this ground.",
    landmark: { name: "The busiest pedestrian crossing on earth", lat: 35.6595, lon: 139.7005 },
    decoys: ["Seoul", "Osaka", "Taipei"],
    accept: ["tokyo"],
    fact: "Shinjuku station handles around 3.5 million passengers a day, more than any other station anywhere.",
  },
  {
    id: "buenosaires",
    name: "Buenos Aires",
    country: "Argentina",
    lat: -34.603,
    lon: -58.381,
    tier: "hard",
    zoom: 14,
    opener: "South America, Atlantic side. Flat and gridded.",
    clue: "A South American capital on the widest river estuary in the world.",
    landmark: { name: "Obelisk on a sixteen-lane avenue", lat: -34.6037, lon: -58.3816 },
    decoys: ["Montevideo", "Santiago", "Porto Alegre"],
    accept: ["buenos aires"],
    fact: "The Rio de la Plata is 220 km wide at its mouth, so wide that the far bank is over the horizon.",
  },
];
