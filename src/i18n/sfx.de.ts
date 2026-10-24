// Слова-звуки (раздел 9.3): немецкие, как во всей серии, — капсом.

export type SfxWord =
  | 'los'
  | 'klonk'
  | 'fauch'
  | 'plumps'
  | 'passtNicht'
  | 'nurBirke'
  | 'knurr'
  | 'auuuh'
  | 'zisch'
  | 'glimm'
  | 'drei'
  | 'zwei'
  | 'eins'
  | 'jaul'
  | 'saus'
  | 'wusch'
  | 'hoppla'
  | 'haps'
  | 'huch'
  | 'gaehn'
  | 'tschilp'
  | 'kikeriki'
  | 'gutenMorgen'
  | 'knapp';

export const sfxDe: Record<SfxWord, string> = {
  los: 'LOS!',
  klonk: 'KLONK!',
  fauch: 'FAUCH!',
  plumps: 'PLUMPS!',
  passtNicht: 'PASST NICHT!',
  nurBirke: 'NUR BIRKE!',
  knurr: 'KNURR…',
  auuuh: 'AUUUH!',
  zisch: 'ZISCH…',
  glimm: 'GLIMM…',
  drei: 'DREI!',
  zwei: 'ZWEI!',
  eins: 'EINS!',
  jaul: 'JAUL!',
  saus: 'SAUS…',
  wusch: 'WUSCH!',
  hoppla: 'HOPPLA!',
  haps: 'HAPS!',
  huch: 'HUCH!',
  gaehn: 'GÄHN…',
  tschilp: 'TSCHILP!',
  kikeriki: 'KIKERIKI!',
  gutenMorgen: 'GUTEN MORGEN!',
  knapp: 'KNAPP!',
};
