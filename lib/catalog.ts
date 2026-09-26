export type Star = {
  id: string;
  name: string;
  ra: number; // hours, J2000
  dec: number; // degrees, J2000
  magnitude: number;
  constellation?: string;
  color?: string;
};

// Curated naked-eye reference set. Coordinates are J2000 values; the planet/moon positions
// are calculated dynamically with Astronomy Engine. This list is deliberately small for the
// first release so mobile GPUs aren't burdened by a huge catalogue before the scene is visible.
export const BRIGHT_STARS: Star[] = [
  { id:"sirius",name:"Sirius",ra:6.752481,dec:-16.716116,magnitude:-1.46,color:"#dfe9ff",constellation:"CMa" },
  { id:"canopus",name:"Canopus",ra:6.399195,dec:-52.695661,magnitude:-0.74,color:"#fff2dc",constellation:"Car" },
  { id:"arcturus",name:"Arcturus",ra:14.261021,dec:19.182417,magnitude:-0.05,color:"#ffd5ae",constellation:"Boo" },
  { id:"vega",name:"Vega",ra:18.615649,dec:38.783689,magnitude:0.03,color:"#d8e6ff",constellation:"Lyr" },
  { id:"capella",name:"Capella",ra:5.278155,dec:45.998027,magnitude:0.08,color:"#ffe7ba",constellation:"Aur" },
  { id:"rigel",name:"Rigel",ra:5.242298,dec:-8.201640,magnitude:0.13,color:"#cfe0ff",constellation:"Ori" },
  { id:"procyon",name:"Procyon",ra:7.655033,dec:5.225012,magnitude:0.34,color:"#fff4de",constellation:"CMi" },
  { id:"betelgeuse",name:"Betelgeuse",ra:5.919529,dec:7.407063,magnitude:0.42,color:"#ffb58d",constellation:"Ori" },
  { id:"achernar",name:"Achernar",ra:1.628564,dec:-57.236753,magnitude:0.46,color:"#d6e5ff",constellation:"Eri" },
  { id:"hadar",name:"Hadar",ra:14.063726,dec:-60.373039,magnitude:0.61,color:"#d6e7ff",constellation:"Cen" },
  { id:"altair",name:"Altair",ra:19.846389,dec:8.868322,magnitude:0.77,color:"#edf5ff",constellation:"Aql" },
  { id:"aldebaran",name:"Aldebaran",ra:4.598677,dec:16.509302,magnitude:0.85,color:"#ffc08d",constellation:"Tau" },
  { id:"spica",name:"Spica",ra:13.419883,dec:-11.161322,magnitude:0.97,color:"#d8e9ff",constellation:"Vir" },
  { id:"antares",name:"Antares",ra:16.490129,dec:-26.431946,magnitude:1.09,color:"#ff9d84",constellation:"Sco" },
  { id:"pollux",name:"Pollux",ra:7.755263,dec:28.026199,magnitude:1.14,color:"#ffdcae",constellation:"Gem" },
  { id:"fomalhaut",name:"Fomalhaut",ra:22.960848,dec:-29.622236,magnitude:1.16,color:"#e6efff",constellation:"PsA" },
  { id:"deneb",name:"Deneb",ra:20.690532,dec:45.280338,magnitude:1.25,color:"#dce9ff",constellation:"Cyg" },
  { id:"regulus",name:"Regulus",ra:10.139532,dec:11.967208,magnitude:1.40,color:"#eaf2ff",constellation:"Leo" },
  { id:"castor",name:"Castor",ra:7.576667,dec:31.888306,magnitude:1.58,color:"#eaf2ff",constellation:"Gem" },
  { id:"bellatrix",name:"Bellatrix",ra:5.418852,dec:6.349703,magnitude:1.64,color:"#bed7ff",constellation:"Ori" },
  { id:"elnath",name:"Elnath",ra:5.438198,dec:28.607451,magnitude:1.65,color:"#dbe8ff",constellation:"Tau" },
  { id:"miaplacidus",name:"Miaplacidus",ra:9.220367,dec:-69.717208,magnitude:1.67,color:"#dfeaff",constellation:"Car" },
  { id:"alnilam",name:"Alnilam",ra:5.603559,dec:-1.201917,magnitude:1.69,color:"#c9dcff",constellation:"Ori" },
  { id:"alioth",name:"Alioth",ra:12.900472,dec:55.959833,magnitude:1.76,color:"#e8f0ff",constellation:"UMa" },
  { id:"dubhe",name:"Dubhe",ra:11.062154,dec:61.751033,magnitude:1.79,color:"#ffe3b7",constellation:"UMa" },
  { id:"alnair",name:"Alnair",ra:22.137056,dec:-46.961000,magnitude:1.79,color:"#dce9ff",constellation:"Gru" },
  { id:"mirfak",name:"Mirfak",ra:3.405398,dec:49.861180,magnitude:1.80,color:"#e6efff",constellation:"Per" },
  { id:"regor",name:"Regor",ra:8.158876,dec:-47.336587,magnitude:1.78,color:"#cfe1ff",constellation:"Vel" },
  { id:"polaris",name:"Polaris",ra:2.530301,dec:89.264109,magnitude:1.98,color:"#f6ecda",constellation:"UMi" },
  { id:"menkalinan",name:"Menkalinan",ra:5.992117,dec:44.947433,magnitude:1.90,color:"#eaf0ff",constellation:"Aur" }
];

export function searchStars(q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return BRIGHT_STARS.filter(s => s.name.toLowerCase().includes(needle) || s.constellation?.toLowerCase() === needle).slice(0, 8);
}
