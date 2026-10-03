// src/lib/giftAssets.ts
// GENERATED from assets/gifts/*.png — one require() per file (Metro needs static paths).
// Gift icons ship inside the app; the database's icon_url is matched to them by file name,
// falling back to the URL itself for any gift that isn't bundled.
const BUNDLED: Record<string, number> = {
  "agbalumo": require("../../assets/gifts/agbalumo.png"),
  "amala": require("../../assets/gifts/amala.png"),
  "ankh": require("../../assets/gifts/ankh.png"),
  "ankle-rattle": require("../../assets/gifts/ankle-rattle.png"),
  "ashanti-gold-weight": require("../../assets/gifts/ashanti-gold-weight.png"),
  "ashanti-golden-stool": require("../../assets/gifts/ashanti-golden-stool.png"),
  "baobab-tree": require("../../assets/gifts/baobab-tree.png"),
  "baule-mask": require("../../assets/gifts/baule-mask.png"),
  "benin-bronze-head": require("../../assets/gifts/benin-bronze-head.png"),
  "bole": require("../../assets/gifts/bole.png"),
  "ceremonial-staff": require("../../assets/gifts/ceremonial-staff.png"),
  "compass-sankofa": require("../../assets/gifts/compass-sankofa.png"),
  "cowrie-shell": require("../../assets/gifts/cowrie-shell.png"),
  "crown-beaded": require("../../assets/gifts/crown-beaded.png"),
  "diamond-gem": require("../../assets/gifts/diamond-gem.png"),
  "djembe-drum": require("../../assets/gifts/djembe-drum.png"),
  "dogon-mask": require("../../assets/gifts/dogon-mask.png"),
  "ekwe": require("../../assets/gifts/ekwe.png"),
  "ewedu": require("../../assets/gifts/ewedu.png"),
  "eyo-masquerade": require("../../assets/gifts/eyo-masquerade.png"),
  "flame-oil-lamp": require("../../assets/gifts/flame-oil-lamp.png"),
  "fufu": require("../../assets/gifts/fufu.png"),
  "great-zimbabwe-bird": require("../../assets/gifts/great-zimbabwe-bird.png"),
  "gye-nyame-adinkra": require("../../assets/gifts/gye-nyame-adinkra.png"),
  "insight-divination-tray": require("../../assets/gifts/insight-divination-tray.png"),
  "ji": require("../../assets/gifts/ji.png"),
  "kalimba": require("../../assets/gifts/kalimba.png"),
  "kente-cloth": require("../../assets/gifts/kente-cloth.png"),
  "kolanut": require("../../assets/gifts/kolanut.png"),
  "lalibela-cross": require("../../assets/gifts/lalibela-cross.png"),
  "maasai-beadwork": require("../../assets/gifts/maasai-beadwork.png"),
  "nok-terracotta-head": require("../../assets/gifts/nok-terracotta-head.png"),
  "ogene": require("../../assets/gifts/ogene.png"),
  "ostrich-egg-vessel": require("../../assets/gifts/ostrich-egg-vessel.png"),
  "pammy": require("../../assets/gifts/pammy.png"),
  "pyramid-of-giza": require("../../assets/gifts/pyramid-of-giza.png"),
  "spark-ember": require("../../assets/gifts/spark-ember.png"),
  "suya": require("../../assets/gifts/suya.png"),
  "talking-drum": require("../../assets/gifts/talking-drum.png"),
  "tuareg-cross": require("../../assets/gifts/tuareg-cross.png"),
  "waist-bead": require("../../assets/gifts/waist-bead.png"),
  "zulu-shield": require("../../assets/gifts/zulu-shield.png"),
};

/** Resolve a gift's icon_url to a bundled asset (preferred) or a remote URI. */
export function giftIconSource(iconUrl: string | null | undefined): number | { uri: string } | null {
  if (!iconUrl) return null;
  const match = /([a-z0-9-]+)\.png(?:\?.*)?$/i.exec(iconUrl);
  if (match && BUNDLED[match[1].toLowerCase()]) return BUNDLED[match[1].toLowerCase()];
  return { uri: iconUrl };
}
