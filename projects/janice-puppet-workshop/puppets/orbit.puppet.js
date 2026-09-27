export const ORBIT_PUPPET = {
  schema: "janice",
  schemaVersion: "0.1.0",
  puppetId: "orbit",
  name: "Orbit",
  summary: "A round rolling puppet with wheels, wings, a tail, and no normal legs.",
  favoriteColor: "blue",
  root: {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1
  },
  skeleton: {
    rootJoint: "core",
    joints: [
      { id: "core", parent: null, position: { x: 0, y: 12 } },
      { id: "eye", parent: "core", position: { x: 0, y: -34 } },
      { id: "leftWheel", parent: "core", position: { x: -42, y: 58 } },
      { id: "rightWheel", parent: "core", position: { x: 42, y: 58 } },
      { id: "leftWing", parent: "core", position: { x: -58, y: -4 } },
      { id: "rightWing", parent: "core", position: { x: 58, y: -4 } },
      { id: "tailBase", parent: "core", position: { x: 0, y: 70 } },
      { id: "tailTip", parent: "tailBase", position: { x: 0, y: 46 } }
    ],
    bones: [
      { id: "eyeStem", from: "core", to: "eye" },
      { id: "leftAxle", from: "core", to: "leftWheel" },
      { id: "rightAxle", from: "core", to: "rightWheel" },
      { id: "leftWingBone", from: "core", to: "leftWing" },
      { id: "rightWingBone", from: "core", to: "rightWing" },
      { id: "tailBone", from: "tailBase", to: "tailTip" }
    ]
  },
  bodyParts: [
    { id: "shadow", kind: "prop", joint: "core", layer: 0, shape: { kind: "ellipse", width: 130, height: 20, fill: "#d7d3c7", offset: { x: 0, y: 102 } } },
    { id: "body", kind: "body", joint: "core", layer: 20, shape: { kind: "circle", radius: 58, fill: "#66a6c9", offset: { x: 0, y: 8 } } },
    { id: "face", kind: "face", joint: "eye", layer: 40, shape: { kind: "circle", radius: 22, fill: "#f8f6ef", offset: { x: 0, y: 0 } } },
    { id: "leftWheelPart", kind: "wheel", joint: "leftWheel", layer: 45, shape: { kind: "circle", radius: 18, fill: "#2e4050", offset: { x: 0, y: 0 } } },
    { id: "rightWheelPart", kind: "wheel", joint: "rightWheel", layer: 46, shape: { kind: "circle", radius: 18, fill: "#2e4050", offset: { x: 0, y: 0 } } },
    { id: "leftWingPart", kind: "wing", joint: "leftWing", layer: 30, shape: { kind: "path", fill: "#9fd3e6", d: "M 0 0 C -46 -28 -68 12 -18 32 C -6 22 0 10 0 0 Z" } },
    { id: "rightWingPart", kind: "wing", joint: "rightWing", layer: 31, shape: { kind: "path", fill: "#9fd3e6", d: "M 0 0 C 46 -28 68 12 18 32 C 6 22 0 10 0 0 Z" } },
    { id: "tail", kind: "tail", joint: "tailBase", layer: 25, shape: { kind: "capsule", width: 18, height: 52, fill: "#5d8da8", offset: { x: 0, y: 25 } } }
  ],
  bodyPoints: [
    { id: "eyeCenter", kind: "body", part: "face", position: { x: 0, y: 0 } },
    { id: "smile", kind: "body", part: "body", position: { x: 0, y: 28 } }
  ],
  outfitPoints: [
    { id: "hat", kind: "outfit", part: "face", position: { x: 0, y: -24 } },
    { id: "badge", kind: "outfit", part: "body", position: { x: 32, y: 2 } },
    { id: "tailRibbon", kind: "outfit", part: "tail", position: { x: 0, y: 12 } }
  ],
  outfits: [
    {
      id: "spaceBlue",
      name: "Space Blue",
      items: [
        { id: "badgePlate", point: "badge", layer: 70, shape: { kind: "circle", radius: 13, fill: "#f0c34e", offset: { x: 0, y: 0 } } }
      ]
    }
  ],
  accessories: [
    { id: "partyHat", name: "Party Hat", point: "hat", layer: 80, shape: { kind: "path", fill: "#c95067", d: "M -14 0 L 0 -38 L 14 0 Z" } },
    { id: "tailRibbon", name: "Tail Ribbon", point: "tailRibbon", layer: 81, shape: { kind: "path", fill: "#58b66f", d: "M 0 0 L -18 -10 L -18 10 Z M 0 0 L 18 -10 L 18 10 Z" } }
  ],
  visibilitySets: {
    rolling: { show: ["leftWheelPart", "rightWheelPart", "tail"], hide: ["leftWingPart", "rightWingPart"] },
    flying: { show: ["leftWingPart", "rightWingPart"], hide: ["leftWheelPart", "rightWheelPart"] },
    still: { show: ["body", "face"], hide: [] }
  },
  clips: [
    { id: "stillClip", kind: "idle", visibilitySet: "still", jointTurns: {} },
    { id: "rollLeftClip", kind: "walk", intent: "left", visibilitySet: "rolling", rootMotion: { x: -22, y: 0 }, jointTurns: { leftWheel: -45, rightWheel: -45, tailBase: 10 } },
    { id: "rollRightClip", kind: "walk", intent: "right", visibilitySet: "rolling", rootMotion: { x: 22, y: 0 }, jointTurns: { leftWheel: 45, rightWheel: 45, tailBase: -10 } },
    { id: "wingPopClip", kind: "gesture", visibilitySet: "flying", events: [{ at: "end", emit: "moveComplete" }], jointTurns: { leftWing: -24, rightWing: 24, tailBase: 18 } }
  ],
  moves: [
    { id: "still", name: "Still", clip: "stillClip" },
    { id: "rollLeft", name: "Roll Left", clip: "rollLeftClip" },
    { id: "rollRight", name: "Roll Right", clip: "rollRightClip" },
    { id: "wingPop", name: "Wing Pop", clip: "wingPopClip" }
  ]
};
