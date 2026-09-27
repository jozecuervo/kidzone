export const JANICE_SCHEMA = {
  schema: "janice",
  acronym: "JavaScript Armature Notation for Interactive Character Engines",
  schemaVersion: "0.1.0",
  formatKind: "puppet",
  coordinateSpace: {
    units: "px",
    x: "right",
    y: "down",
    origin: "stage center"
  },
  requiredTopLevelFields: [
    "schema",
    "schemaVersion",
    "puppetId",
    "name",
    "summary",
    "favoriteColor",
    "root",
    "skeleton",
    "bodyParts",
    "bodyPoints",
    "outfitPoints",
    "outfits",
    "accessories",
    "clips",
    "moves",
    "visibilitySets"
  ],
  kidWords: {
    puppet: "A whole character that can dress up and move.",
    skeleton: "The hidden sticks and hinges that help a puppet move.",
    joint: "A bendy spot, like an elbow or knee.",
    bone: "A helper line between two joints.",
    bodyPart: "A visible piece of the puppet.",
    bodyPoint: "A sticker spot for face and hair details.",
    outfitPoint: "A snap spot for clothes, shoes, and accessories.",
    move: "A saved action or pose.",
    clip: "The hidden animation recipe behind a move."
  },
  allowed: {
    bodyPartKinds: [
      "head",
      "hair",
      "face",
      "torso",
      "upper-arm",
      "forearm",
      "hand",
      "upper-leg",
      "lower-leg",
      "foot",
      "tail",
      "wing",
      "wheel",
      "body",
      "prop"
    ],
    controlKinds: ["button", "slider", "drag", "key", "auto"],
    moveKinds: ["pose", "walk", "gesture", "idle", "loop"],
    pointKinds: ["body", "outfit"],
    shapeKinds: ["circle", "ellipse", "rect", "capsule", "path", "polygon"]
  }
};

export const JANICE_MVP_RULES = {
  minPuppets: 2,
  mainPuppetId: "janice",
  mainPuppetNeeds: {
    outfitCount: 3,
    accessoryCount: 3,
    moveIds: ["walk"],
    poseCount: 1,
    requiredOutfitPoints: [
      "hat",
      "glasses",
      "garmentTop",
      "belt",
      "leftShoe",
      "rightShoe"
    ]
  }
};
