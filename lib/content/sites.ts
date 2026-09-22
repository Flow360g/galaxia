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
  /**
   * Bought: one fact about the place that the satellite picture cannot show and
   * the opener did not, told without naming it. History, people, industry,
   * food, culture, an event. It used to be a second terrain description, which
   * meant the first rung sold the same kind of thing the opener gave away free.
   * If the sentence could be written by looking at the image, it belongs in the
   * opener instead.
   */
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
    clue: "Fifty years ago this was a pearl diving port of sixty thousand people. Nine in ten who live here now were born in a different country.",
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
    clue: "It ran a trading empire for a thousand years and elected its ruler, who then kept the job for life, from among its own merchants.",
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
    clue: "More than eight hundred languages are spoken here, more than anywhere on earth, and over a third of the people were born abroad.",
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
    clue: "A university founded here a thousand years ago is still teaching, and its film studios carried the local dialect into homes across the Arabic speaking region.",
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
    clue: "The traditional owners ask that nobody climbs it, and since 2019 that request has been the law.",
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
    clue: "A church here has been under construction since 1882 and is still not done. The first language of the streets is not the national one.",
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
    clue: "The government moved here in 1960 from a coastal city a thousand kilometres away, to pull the country away from its seaboard.",
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
    clue: "Houses here were taxed on their width, so they went up tall and narrow with a hoisting beam at the top to get the furniture in.",
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
    clue: "The first European settlement here was a prison colony, landed in 1788 after the intended spot turned out to have no fresh water.",
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
    clue: "It was the capital of two empires in turn, and it has gone by at least four official names.",
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
    // Nudged north of the city centre so the stadium pin stays inside the crop
    // at the tightest zoom the dial reaches. It used to fall just outside, and
    // the marker silently vanished on a rung the player had paid for.
    lat: -33.92,
    lon: 18.424,
    tier: "medium",
    zoom: 13,
    opener: "Southern hemisphere. A port hemmed in by mountains.",
    clue: "In 2018 it came within weeks of turning the taps off, counting down in public to the day the supply would run out.",
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
    clue: "It has four official languages, imports much of its drinking water, and chewing gum cannot be sold in the shops.",
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
    clue: "It holds more museums than almost any city on earth, and it was the seat of an empire that fell to Spanish conquest in 1521.",
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
    clue: "A network of runners delivers two hundred thousand home cooked lunches across the city each day, sorted by colour code and almost never lost.",
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
    clue: "It has burned down, fallen down and been rebuilt so often that almost nothing standing here is more than eighty years old.",
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
    clue: "Half the people here trace their families back to Italy and Spain, and it has more psychoanalysts per head than any city going.",
    landmark: { name: "Obelisk on a sixteen-lane avenue", lat: -34.6037, lon: -58.3816 },
    street: { file: "Beruti Street, Palermo.jpg", credit: "L. W. Yang", licence: "CC BY 2.0" },
    structure: { file: "Obelisco de Buenos Aires (2), AA 2014.jpg", credit: "Green Mostaza", licence: "CC BY 4.0" },
    decoys: ["Montevideo", "Santiago", "Porto Alegre"],
    accept: ["buenos aires"],
    fact: "The Rio de la Plata is 220 km wide at its mouth, so wide that the far bank is over the horizon.",
  },
  {
    id: "paris",
    name: "Paris",
    country: "France",
    lat: 48.869,
    lon: 2.31,
    tier: "easy",
    zoom: 13,
    opener: "Northern Europe, inland, on a wide river. Dense, pale and low, with almost no skyscrapers.",
    clue: "The revolution that began here in 1789 gave the world the metric system, and a new calendar that lasted barely a decade.",
    landmark: { name: "Iron lattice tower standing on its own by the water", lat: 48.8584, lon: 2.2945 },
    street: { file: "Fontaine Wallace - Place de la République.jpg", credit: "Coyau", licence: "CC BY-SA 3.0" },
    structure: { file: "Der Eiffelturm - panoramio.jpg", credit: "Jola Sik", licence: "CC BY 3.0" },
    decoys: ["Vienna", "Brussels", "Lyon"],
    accept: ["paris"],
    fact: "The iron tower was meant to stand for twenty years and come down. The army kept it because it made a good radio mast.",
  },
  {
    id: "london",
    name: "London",
    country: "United Kingdom",
    lat: 51.5033,
    lon: -0.1196,
    tier: "easy",
    zoom: 13,
    opener: "Northern Europe, on a tidal river that doubles back on itself. Grey, sprawling and unusually green.",
    clue: "It has hosted the summer Olympic Games three times, more than any city has, and it opened the first underground railway anywhere.",
    landmark: { name: "Clock tower at the end of a riverside parliament", lat: 51.5007, lon: -0.1246 },
    street: { file: "Steam Passage Tavern, Islington, N1 (6246147534).jpg", credit: "Ewan Munro from London, UK", licence: "CC BY-SA 2.0" },
    structure: { file: "Big Ben, London (7601807122).jpg", credit: "Berit from Redhill/Surrey, UK", licence: "CC BY 2.0" },
    decoys: ["Dublin", "Manchester", "Birmingham"],
    accept: ["london"],
    fact: "The river stank so badly in 1858 that Parliament hung lime-soaked curtains at the windows and nearly moved out.",
  },
  {
    id: "moscow",
    name: "Moscow",
    country: "Russia",
    lat: 55.752,
    lon: 37.6175,
    tier: "medium",
    zoom: 13,
    opener: "Far north, deep inland, and bitterly cold in winter. Huge blocks and enormously wide roads.",
    clue: "Its metro stations were fitted out with chandeliers, mosaics and marble, and were dug deep enough to double as bomb shelters.",
    landmark: { name: "Cathedral topped with a cluster of twisted coloured domes", lat: 55.7525, lon: 37.6231 },
    street: { file: "Moscow, Goncharnaya 27.jpg", credit: "NVO", licence: "CC BY 3.0" },
    structure: { file: "Saint Basil's Cathedral, Exterior 01.jpg", credit: "Godot13", licence: "CC BY-SA 3.0" },
    decoys: ["Kyiv", "Saint Petersburg", "Minsk"],
    accept: ["moscow", "moskva"],
    fact: "Each ring road traces a defensive wall. They were demolished one by one and paved over where they had stood.",
  },
  {
    id: "santorini",
    name: "Santorini",
    country: "Greece",
    lat: 36.416,
    lon: 25.432,
    tier: "hard",
    zoom: 12,
    opener: "A Mediterranean island, dry and almost treeless, curved like a broken ring.",
    clue: "Its vines are trained coiled into low baskets on the soil, because nothing here shelters them from the wind and it barely rains.",
    landmark: { name: "White town strung along the top of a sheer cliff", lat: 36.4167, lon: 25.4318 },
    street: { file: "Santorini (8299019156).jpg", credit: "Pedro Szekely from Los Angeles, USA", licence: "CC BY-SA 2.0" },
    structure: { file: "Fira - crater rim - Santorini - Greece - 01.jpg", credit: "Norbert Nagel", licence: "CC BY-SA 3.0" },
    decoys: ["Mykonos", "Ibiza", "Malta"],
    accept: ["santorini", "thira", "thera"],
    fact: "The eruption that made the bay was one of the largest in human history and may have finished Minoan Crete.",
  },
  {
    id: "marrakesh",
    name: "Marrakesh",
    country: "Morocco",
    lat: 31.6258,
    lon: -7.9891,
    tier: "medium",
    zoom: 13,
    opener: "North Africa, well inland, at the foot of a snow-capped range. Dry, reddish ground.",
    clue: "Its main square fills each evening with snake charmers, storytellers and food stalls, a nightly ritual the UN lists as heritage.",
    landmark: { name: "Square stone minaret rising over a walled quarter", lat: 31.6238, lon: -7.9938 },
    street: { file: "City Walls, Marrakech (363261710).jpg", credit: "Antony Stanley from Gloucester, UK", licence: "CC BY-SA 2.0" },
    structure: { file: "Marrakech, Morocco (5421595453) (5).jpg", credit: "YoTuT from United States", licence: "CC BY 2.0" },
    decoys: ["Fez", "Tunis", "Algiers"],
    accept: ["marrakesh", "marrakech"],
    fact: "The ochre is required by law, which is why the entire city photographs as one shade of red.",
  },
  {
    id: "lagos",
    name: "Lagos",
    country: "Nigeria",
    lat: 6.455,
    lon: 3.42,
    tier: "hard",
    zoom: 12,
    opener: "West Africa, tropical, on a lagoon behind a long sandbar. Enormous, and still growing fast.",
    clue: "Its film studios put out more titles a year than Hollywood does, and it lost its job as the national capital in 1991.",
    landmark: { name: "Waterfront hall with a row of blue spikes for a roof", lat: 6.431, lon: 3.424 },
    street: { file: "1004 building, lekki road, Lagos, Nigeria.jpg", credit: "Johnbrainyvisuals (OgedengbeTobi John)", licence: "CC BY-SA 4.0" },
    structure: { file: "Civic Centre at night, Lagos Nigeria.jpg", credit: "Ade Marquis", licence: "CC BY-SA 4.0" },
    decoys: ["Accra", "Abidjan", "Douala"],
    accept: ["lagos"],
    fact: "Around twenty million people live here, more than any other African city, and the figure climbs every year.",
  },
  {
    id: "rio",
    name: "Rio de Janeiro",
    country: "Brazil",
    lat: -22.95,
    lon: -43.21,
    tier: "medium",
    zoom: 12,
    opener: "South America, tropical coast, with forested granite peaks dropping right onto the beaches.",
    clue: "Its carnival is the biggest street party on the planet, and for thirteen years it served as the capital of a European kingdom.",
    landmark: { name: "Giant statue with outstretched arms on a mountain top", lat: -22.9519, lon: -43.2105 },
    street: { file: "Igreja Matriz Santa Margarida Maria, vista do Corcovado.JPG", credit: "Geogast", licence: "CC BY-SA 4.0" },
    structure: { file: "Estamos Juntos Com O Cristo Redentor.jpg", credit: "Raul Vaccaro", licence: "CC BY-SA 3.0" },
    decoys: ["Salvador", "Santos", "Montevideo"],
    accept: ["rio de janeiro", "janeiro", "rio"],
    fact: "Sailors named it on the first of January 1502, having mistaken the mouth of the bay for a river.",
  },
  {
    id: "sanfrancisco",
    name: "San Francisco",
    country: "United States",
    lat: 37.78,
    lon: -122.435,
    tier: "medium",
    zoom: 12,
    opener: "West coast of North America, cool and often fogbound, on the tip of a peninsula.",
    clue: "A gold rush in 1849 turned it from a village into a boom town inside a year, and an earthquake levelled most of it in 1906.",
    landmark: { name: "Orange suspension bridge carried on two tall towers", lat: 37.8078, lon: -122.475 },
    street: { file: "Muni 1060 at 17th and Castro, September 2007.jpg", credit: "Roman SUZUKI", licence: "CC BY 3.0" },
    structure: { file: "Golden Gate Bridge San Francisco September 2012 005.jpg", credit: "King of Hearts", licence: "CC BY-SA 3.0" },
    decoys: ["Seattle", "Portland", "San Diego"],
    accept: ["san francisco", "frisco"],
    fact: "The bridge is painted international orange because it stands out in the fog that fills the strait most mornings.",
  },
  {
    id: "vancouver",
    name: "Vancouver",
    country: "Canada",
    lat: 49.283,
    lon: -123.118,
    tier: "medium",
    zoom: 12,
    opener: "Pacific coast of North America, wet and mild, with mountains rising straight behind the city.",
    clue: "More television is shot here than anywhere outside Los Angeles, and against local wages a house costs more here than almost anywhere on earth.",
    landmark: { name: "Waterfront hall roofed with five white sails", lat: 49.2888, lon: -123.1111 },
    street: { file: "Vernon Block Vancouver.JPG", credit: "Canadian2006", licence: "CC BY-SA 3.0" },
    structure: { file: "Canada Place evening (3702771906).jpg", credit: "BriYYZ from Toronto, Canada", licence: "CC BY-SA 2.0" },
    decoys: ["Seattle", "Portland", "Victoria"],
    accept: ["vancouver"],
    fact: "The park at the harbour mouth is larger than New York's Central Park and most of it was never cleared.",
  },
  {
    id: "hongkong",
    name: "Hong Kong",
    country: "China",
    // Off the clock tower on purpose: with the pin at the exact centre of the
    // crop its label covers the optic and its position says nothing.
    lat: 22.299,
    lon: 114.175,
    tier: "hard",
    zoom: 13,
    opener: "Subtropical East Asia, on a deep natural harbour between a mountainous island and the mainland.",
    clue: "It has more skyscrapers than any city on the planet, and yet three quarters of its land has never been developed at all.",
    landmark: { name: "Lone brick clock tower left over from a vanished railway station", lat: 22.2936, lon: 114.1694 },
    street: { file: "Langham Place, Mongkok, Hong Kong - panoramio.jpg", credit: "y-yoshiike", licence: "CC BY 3.0" },
    structure: { file: "HongKong ClockTower Wikimania.jpg", credit: "Polimerek", licence: "CC BY-SA 3.0" },
    decoys: ["Macau", "Shenzhen", "Taipei"],
    accept: ["hong kong", "hongkong"],
    fact: "The clock tower is all that is left of the terminus where the railway line from Europe once ended.",
  },
  {
    id: "bangkok",
    name: "Bangkok",
    country: "Thailand",
    lat: 13.735,
    lon: 100.498,
    tier: "hard",
    zoom: 13,
    opener: "Tropical Southeast Asia, flat as a table, on a river that coils back on itself again and again.",
    clue: "It draws more foreign visitors than any city on earth, and the food sold from its pavement carts has won Michelin stars.",
    landmark: { name: "Riverside temple with a tall spire crusted in porcelain", lat: 13.7437, lon: 100.4889 },
    street: { file: "Phaya Thai Road AMLO IMG 7021.jpg", credit: "Bjoertvedt", licence: "CC BY-SA 4.0" },
    structure: { file: "Central Prang--Wat Arun.jpg", credit: "Kevinsmithnyc", licence: "CC BY-SA 3.0" },
    decoys: ["Hanoi", "Yangon", "Phnom Penh"],
    accept: ["bangkok", "krung thep"],
    fact: "Its full ceremonial name runs to 168 letters and holds the record for the longest place name anywhere.",
  },
  {
    id: "seoul",
    name: "Seoul",
    country: "South Korea",
    lat: 37.53,
    lon: 126.98,
    tier: "hard",
    zoom: 12,
    opener: "Temperate East Asia, on a broad river, ringed by low forested mountains.",
    clue: "One family ruled from here for five centuries, and the writing on every shopfront uses an alphabet designed from scratch in the 1440s.",
    landmark: { name: "Broadcast tower on a wooded hill above the centre", lat: 37.5512, lon: 126.9882 },
    street: { file: "Seogyo-dong, Mapo-gu, Seoul, South Korea - panoramio.jpg", credit: "Phong Phat G", licence: "CC BY-SA 3.0" },
    structure: { file: "Namsan Mountain and Seoul Tower (49174479208).jpg", credit: "Matt Kieffer from London, United Kingdom", licence: "CC BY-SA 2.0" },
    decoys: ["Busan", "Osaka", "Pyongyang"],
    accept: ["seoul"],
    fact: "Half the country's people live in this one metropolitan area, which is why it spread along the river valley.",
  },
];

/**
 * The rungs must not repeat each other, and none of them may name the answer.
 *
 * Every rung is bought with points, so a rung that restates the free opener is
 * a rung the player paid for and got nothing from. It happened in play: the
 * opener read "Northern Europe, at sea level, and very wet" and the intel that
 * cost 25 points opened with "Northern Europe, at sea level". The opener owns
 * continent, climate and terrain; the clue owns one fact about the place that
 * the picture cannot show; the `fact` owns the payoff, and is read only once
 * the site has been called.
 *
 * Checked at import, in the build, the way a malformed round is. It matters more
 * once the AUTOMATION SEAM above is real and this prose is generated rather than
 * written, because nobody will be reading the rungs side by side any more.
 */
const OPENER_STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "along",
  "another",
  "around",
  "before",
  "being",
  "built",
  "could",
  "every",
  "having",
  "itself",
  "other",
  "should",
  "since",
  "their",
  "there",
  "these",
  "thing",
  "through",
  "under",
  "where",
  "which",
  "while",
  "whole",
  "world",
  "would",
]);

/** Words of five letters or more, lowercased and stripped of punctuation. */
function distinctive(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter(
    (word) => !OPENER_STOPWORDS.has(word),
  );
}

/**
 * Does `text` say `phrase`, as words rather than as letters inside a word?
 *
 * Word boundaries, not a substring test. `accept` carries short forms (rio,
 * nyc, thira, frisco) and a bare `includes` fires on ordinary prose: "rio" is
 * inside "period", "lima" is inside "climate".
 */
function says(text: string, phrase: string): boolean {
  const escaped = phrase
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  if (escaped.length === 0) return false;
  return new RegExp(`\\b${escaped}\\b`).test(text.toLowerCase());
}

for (const site of SITES) {
  const opener = new Set(distinctive(site.opener));
  const repeated = distinctive(site.clue).filter((word) => opener.has(word));
  if (repeated.length > 0) {
    throw new Error(
      `Site ${site.id}: the clue repeats the free opener (${repeated.join(", ")}). ` +
        `Intel is paid for, so it has to carry something new.`,
    );
  }

  // The clue is a fact about the place and so is `fact`, one rung apart, so
  // they are the pair most likely to collapse into the same sentence. The
  // difference is when they are read: the clue is bought while the question is
  // live, the fact is the payoff once the site has been called.
  const payoff = new Set(distinctive(site.fact));
  const spoiled = distinctive(site.clue).filter((word) => payoff.has(word));
  if (spoiled.length > 0) {
    throw new Error(
      `Site ${site.id}: the clue restates the reveal fact (${spoiled.join(", ")}). ` +
        `Buying a hint must not spend the ending.`,
    );
  }

  // Nothing a player reads before calling the site may name it. The photo
  // credits are not in here because the author is held back until the reveal,
  // which is the only reason "Ewan Munro from London, UK" is not a problem.
  const forbidden = [site.name, site.country, ...site.accept, ...site.decoys];
  for (const [rung, text] of [
    ["opener", site.opener],
    ["clue", site.clue],
    ["landmark", site.landmark?.name ?? ""],
  ] as const) {
    const leak = forbidden.find((phrase) => says(text, phrase));
    if (leak !== undefined) {
      throw new Error(
        `Site ${site.id}: the ${rung} says "${leak}", which hands over the answer. ` +
          `A rung describes the place without naming it or anything it could be confused with.`,
      );
    }
  }
}

/**
 * The two sites for a date. Seeded by the date key alone, so every player on
 * the same day gets the same pair in the same order, which is the whole basis
 * of comparing two runs.
 *
 * The pair is always two different sites. Twenty-eight sites is two weeks of
 * pairs before one comes round again; topping it up is the only thing needed
 * to run longer, and nothing else has to change.
 */
export function pickSites(dateKey: string): [Site, Site] {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  }
  // Two consecutive dates differ by one character, so the raw fold lands in
  // nearby places and `% span` clusters: over a year some sites came up fifty
  // times and others nine, against an even twenty-six. Mix the fold properly
  // and read the top bits, the same fix `seededShuffle` needed.
  const span = SITES.length;
  const first = Math.floor(spread(hash) * span);
  // A second, independent step so the pair is not always adjacent, and never
  // the same site twice.
  const stride = 1 + Math.floor(spread(hash ^ 0x5bf03635) * (span - 1));
  const second = (first + stride) % span;
  return [SITES[first] as Site, SITES[second] as Site];
}

/** A 32-bit fold to a well spread 0..1, so a modulo of it does not clump. */
function spread(seed: number): number {
  let z = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return ((z ^ (z >>> 15)) >>> 0) / 0x100000000;
}
