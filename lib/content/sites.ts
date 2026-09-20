/**
 * WHERE ON EARTH: the site pool.
 *
 * Every site the satellite feed can land on, and everything an encounter needs
 * to run one: where to point the optic, what the free opener says, what intel
 * sells, which structure to pin, and two photographs from the ground.
 *
 * These began as a throwaway difficulty mockup at /satellite-mock and were
 * promoted once the playtest settled the framing. Each `zoom` is the framing at
 * which that city's giveaway actually fits: Amsterdam's canal ring is about
 * 2.5km across, so a tighter crop cannot show the one feature that identifies
 * it. Every Commons file here was opened and looked at, not trusted from its
 * filename.
 *
 * AUTOMATION SEAM. `pickSites` is the only thing the game calls, and it is
 * deliberately the whole interface. A future build can replace the constant
 * pool with a generated one (Wikidata for the city and its landmark, Commons
 * geosearch for the photographs) without touching the encounter, the scoring
 * or the UI. What must not change is the contract: for a given date key every
 * player gets the same pair, in the same order, or two runs stop being
 * comparable and the whole daily format goes with it.
 */

export type Tier = "easy" | "medium" | "hard";

/** One Commons photograph. `file` is the "File:" name and is never rendered. */
export interface Shot {
  file: string;
  /** The author, because CC BY and CC BY-SA both require the credit. */
  credit: string;
  licence: string;
}

export interface Site {
  id: string;
  /** The answer, as shown on reveal. */
  name: string;
  country: string;
  lat: number;
  lon: number;
  tier: Tier;
  /** Slippy-map zoom that frames the giveaway. */
  zoom: number;
  /** Free at the start: continent, climate, terrain. Never enough on its own. */
  opener: string;
  /** Bought. Strong by design, which is why it is not given away. */
  clue: string;
  /** Bought: a structure pinned in the optic, described without naming the place. */
  landmark?: { name: string; lat: number; lon: number };
  /** Bought: an ordinary road. Signage, traffic, build. */
  street?: Shot;
  /** Bought: the pinned structure itself. */
  structure?: Shot;
  /** Lane mode kept for the tally's "you could have picked" line. */
  decoys: [string, string, string];
  /** Typed mode: lowercase substrings that count as correct. */
  accept: string[];
  fact: string;
}

export const SITES: Site[] = [
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
    street: { file: "Al Karama dubai street.jpg", credit: "Vicharam", licence: "CC BY-SA 4.0" },
    structure: { file: "UAE (5522283768).jpg", credit: "skhakirov from Donetsk, Ukraine", licence: "CC BY-SA 2.0" },
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
    street: { file: "Venice alleys (39475218242).jpg", credit: "Fernando Coelho from Utrecht, The Nederlands", licence: "CC BY 2.0" },
    structure: { file: "Campanile St. Mark's Basilica Venezia 06 2017 2925.jpg", credit: "Mariordo (Mario Roberto Durán Ortiz)", licence: "CC BY-SA 4.0" },
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
    street: { file: "East side of Manhattan street looking west with trees and cars.jpg", credit: "Tomwsulcer", licence: "CC0" },
    structure: { file: "Fountain in Jacqueline Kennedy Onassis Central Park Reservoir Upper West Side Manhattan Skyline View.jpg", credit: "EgorovaSvetlana", licence: "CC BY-SA 4.0" },
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
    street: { file: "A street in Cairo 03289.jpg", credit: "Al Jazeera English", licence: "CC BY-SA 2.0" },
    structure: { file: "The Great Pyramid of Giza (Pyramid of Cheops or Khufu) (14797814994).jpg", credit: "Jorge Láscar from Melbourne, Australia", licence: "CC BY 2.0" },
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
    street: { file: "Aymar 10-16.jpg", credit: "Xavier Badia Castellà", licence: "CC BY-SA 3.0" },
    structure: { file: "Barcelona - Casa Milà.jpg", credit: "Fred Romero", licence: "CC BY 2.0" },
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
    street: { file: "Brasilia street xenia antunes.JPG", credit: "Xenia Antunes", licence: "CC BY-SA 4.0" },
    structure: { file: "Brazilian National Congress.jpg", credit: "Eurico Zimbres", licence: "CC BY-SA 2.5" },
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
    street: { file: "View on a temporary bike-path along the sidewalk wit walking people and the road Ruijterkade; location is behind Central Station Amsterdam; free photo by Fons Heijnsbroek, April 2022.tif", credit: "Fons Heijnsbroek", licence: "CC0" },
    structure: { file: "Rijksmuseum, Amsterdam, Netherlands (Unsplash).jpg", credit: "Will van Wingerden willvanw", licence: "CC0" },
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
    street: { file: "AUS Sydney, Woollahra, Guilfoyle Avenue 001.jpg", credit: "-wuppertaler", licence: "CC BY 4.0" },
    structure: { file: "Exterior of Sydney Opera House.jpg", credit: "BennyG3255", licence: "CC BY-SA 4.0" },
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
    street: { file: "Busy road in Istanbul 01.JPG", credit: "Ibrahim Husain Meraj", licence: "CC BY-SA 3.0" },
    structure: { file: "Hagia Sophia Mars 2013.jpg", credit: "Arild Vågen", licence: "CC BY-SA 3.0" },
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
    street: { file: "A Street in Meadowridge, Cape Town (1).jpg", credit: "Husskeyy", licence: "CC BY-SA 4.0" },
    structure: { file: "Cape Town Stadium, Cape Town, South Africa (Unsplash).jpg", credit: "Deklerk Basson dkbasson", licence: "CC0" },
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
    street: { file: "2013-01-22 Street in Singapore.jpg", credit: "Karl Baron", licence: "CC BY 2.0" },
    structure: { file: "2016 Singapur, Downtown Core, Marina Bay Sands (01).jpg", credit: "Marcin Konsek", licence: "CC BY-SA 4.0" },
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
    street: { file: "Autobús de transporte público durante una filmación en la Ciudad de México 01.jpg", credit: "Luisalvaz", licence: "CC BY-SA 4.0" },
    structure: { file: "Catedral de Mexico - Mexico 2024.jpg", credit: "José Luiz", licence: "CC BY-SA 4.0" },
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
    street: { file: "Bandra talao road.JPG", credit: "Karthikndr", licence: "CC BY-SA 3.0" },
    structure: { file: "Chhatrapati Shivaji Maharaj Terminus, Mumbai city.jpg", credit: "Sntshkumar750", licence: "CC0" },
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
    street: { file: "2024-10-20 A street in Tokyo 02.jpg", credit: "Alexkom000", licence: "CC BY 4.0" },
    structure: { file: "1 shibuya crossing 2012.jpg", credit: "chensiyuan", licence: "CC BY-SA 4.0" },
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
    street: { file: "Beruti Street, Palermo.jpg", credit: "L. W. Yang", licence: "CC BY 2.0" },
    structure: { file: "Obelisco de Buenos Aires (2), AA 2014.jpg", credit: "Green Mostaza", licence: "CC BY 4.0" },
    decoys: ["Montevideo", "Santiago", "Porto Alegre"],
    accept: ["buenos aires"],
    fact: "The Rio de la Plata is 220 km wide at its mouth, so wide that the far bank is over the horizon.",
  },
];

/**
 * The two sites for a date. Seeded by the date key alone, so every player on
 * the same day gets the same pair in the same order, which is the whole basis
 * of comparing two runs.
 *
 * The pair is always two different sites. With sixteen sites the pool repeats
 * after eight days; topping it up is the only thing needed to run longer, and
 * nothing else has to change.
 */
export function pickSites(dateKey: string): [Site, Site] {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  }
  const span = SITES.length;
  const first = Math.abs(hash) % span;
  // A second, independent step so the pair is not always adjacent, and never
  // the same site twice.
  const stride = 1 + (Math.abs(Math.imul(hash, 2246822519)) % (span - 1));
  const second = (first + stride) % span;
  return [SITES[first] as Site, SITES[second] as Site];
}
