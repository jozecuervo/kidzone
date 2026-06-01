export const JANICE_PUPPET = {
  schema: "janice",
  schemaVersion: "0.1.0",
  puppetId: "janice",
  name: "JANICE",
  summary: "A green-loving runway model for testing dress-up, walking, and fashion poses.",
  favoriteColor: "green",
  root: {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1
  },
  depth: {
    defaultFacing: "right",
    mirroredLayerBands: [
      { far: { from: 10, to: 13 }, near: { from: 50, to: 53 } },
      { far: { from: 20, to: 23 }, near: { from: 40, to: 43 } }
    ]
  },
  skeleton: {
    rootJoint: "hips",
    joints: [
      { id: "hips", parent: null, position: { x: 0, y: 18 } },
      { id: "chest", parent: "hips", position: { x: 0, y: -56 } },
      { id: "neck", parent: "chest", position: { x: 0, y: -40 } },
      { id: "head", parent: "neck", position: { x: 0, y: -34 } },
      { id: "leftShoulder", parent: "chest", position: { x: -38, y: -12 } },
      { id: "leftElbow", parent: "leftShoulder", position: { x: 0, y: 48 } },
      { id: "leftWrist", parent: "leftElbow", position: { x: 0, y: 46 } },
      { id: "rightShoulder", parent: "chest", position: { x: 38, y: -12 } },
      { id: "rightElbow", parent: "rightShoulder", position: { x: 0, y: 48 } },
      { id: "rightWrist", parent: "rightElbow", position: { x: 0, y: 46 } },
      { id: "leftHip", parent: "hips", position: { x: -18, y: 4 } },
      { id: "leftKnee", parent: "leftHip", position: { x: 0, y: 56 } },
      { id: "leftAnkle", parent: "leftKnee", position: { x: 0, y: 52 } },
      { id: "rightHip", parent: "hips", position: { x: 18, y: 4 } },
      { id: "rightKnee", parent: "rightHip", position: { x: 0, y: 56 } },
      { id: "rightAnkle", parent: "rightKnee", position: { x: 0, y: 52 } }
    ],
    bones: [
      { id: "spine", from: "hips", to: "chest" },
      { id: "neckBone", from: "chest", to: "neck" },
      { id: "headBone", from: "neck", to: "head" },
      { id: "leftUpperArmBone", from: "leftShoulder", to: "leftElbow" },
      { id: "leftForearmBone", from: "leftElbow", to: "leftWrist" },
      { id: "rightUpperArmBone", from: "rightShoulder", to: "rightElbow" },
      { id: "rightForearmBone", from: "rightElbow", to: "rightWrist" },
      { id: "leftThighBone", from: "leftHip", to: "leftKnee" },
      { id: "leftShinBone", from: "leftKnee", to: "leftAnkle" },
      { id: "rightThighBone", from: "rightHip", to: "rightKnee" },
      { id: "rightShinBone", from: "rightKnee", to: "rightAnkle" }
    ]
  },
  bodyParts: [
    { id: "shadow", kind: "prop", joint: "hips", layer: 0, shape: { kind: "ellipse", width: 118, height: 20, fill: "#d9d0bd", offset: { x: 0, y: 146 } } },
    { id: "leftForearm", kind: "forearm", joint: "leftElbow", layer: 10, shape: { kind: "path", fill: "#b98265", d: "M -6 -2 C -10 10 -9 31 -5 43 C -3 50 6 50 7 43 C 9 30 8 10 5 -2 C 2 1 -2 1 -6 -2 Z" } },
    { id: "leftHand", kind: "hand", joint: "leftWrist", layer: 11, shape: { kind: "path", fill: "#b98265", d: "M -7 0 C -11 5 -10 13 -5 17 C 0 21 7 17 9 10 C 10 4 5 -1 -1 -2 Z" } },
    { id: "leftUpperArm", kind: "upper-arm", joint: "leftShoulder", layer: 12, shape: { kind: "path", fill: "#b98265", d: "M 0 -5 C -10 -5 -15 8 -14 25 C -13 36 -9 47 -5 51 C -1 54 6 52 9 45 C 14 32 14 12 9 2 C 7 -2 4 -5 0 -5 Z" } },
    { id: "leftLowerLeg", kind: "lower-leg", joint: "leftKnee", layer: 20, variants: { side: { kind: "path", fill: "#b98265", d: "M -5 -2 C -9 12 -9 34 -6 48 C -5 55 5 55 6 48 C 9 34 9 12 5 -2 C 2 1 -2 1 -5 -2 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -7 -2 C -11 12 -11 34 -7 49 C -5 56 5 56 7 49 C 11 34 11 12 7 -2 C 3 1 -3 1 -7 -2 Z" } },
    { id: "leftFoot", kind: "foot", joint: "leftAnkle", layer: 21, variants: { left: { kind: "path", fill: "#b98265", d: "M -35 7 C -24 1 -8 0 6 4 C 15 7 15 14 3 16 C -12 18 -29 17 -37 12 Z" }, right: { kind: "path", fill: "#b98265", d: "M -6 4 C 8 0 24 1 35 7 C 37 12 29 17 12 16 C -15 14 -15 7 -6 4 Z" }, high: { kind: "path", fill: "#b98265", d: "M -33 5 C -20 -3 0 -2 10 7 C 0 14 -21 16 -35 11 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -6 5 C 7 0 24 1 34 7 C 35 11 29 15 15 16 C -10 15 -13 8 -6 5 Z" } },
    { id: "leftUpperLeg", kind: "upper-leg", joint: "leftHip", layer: 23, variants: { side: { kind: "path", fill: "#b98265", d: "M -8 -4 C -15 8 -14 33 -8 50 C -5 58 6 58 9 50 C 14 33 13 8 8 -4 C 3 -7 -3 -7 -8 -4 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -12 -4 C -19 9 -17 34 -10 52 C -7 61 8 61 11 52 C 18 34 19 9 12 -4 C 5 -8 -5 -8 -12 -4 Z" } },
    { id: "torso", kind: "torso", joint: "chest", layer: 30, shape: { kind: "path", fill: "#b98265", d: "M -28 -34 C -18 -43 18 -43 28 -34 C 35 -17 34 26 25 47 C 18 62 9 70 0 72 C -9 70 -18 62 -25 47 C -34 26 -35 -17 -28 -34 Z" } },
    { id: "rightLowerLeg", kind: "lower-leg", joint: "rightKnee", layer: 40, variants: { side: { kind: "path", fill: "#b98265", d: "M -5 -2 C -9 12 -9 34 -6 48 C -5 55 5 55 6 48 C 9 34 9 12 5 -2 C 2 1 -2 1 -5 -2 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -7 -2 C -11 12 -11 34 -7 49 C -5 56 5 56 7 49 C 11 34 11 12 7 -2 C 3 1 -3 1 -7 -2 Z" } },
    { id: "rightFoot", kind: "foot", joint: "rightAnkle", layer: 41, variants: { left: { kind: "path", fill: "#b98265", d: "M -35 7 C -24 1 -8 0 6 4 C 15 7 15 14 3 16 C -12 18 -29 17 -37 12 Z" }, right: { kind: "path", fill: "#b98265", d: "M -6 4 C 8 0 24 1 35 7 C 37 12 29 17 12 16 C -15 14 -15 7 -6 4 Z" }, high: { kind: "path", fill: "#b98265", d: "M -10 7 C 0 -2 20 -3 33 5 C 35 11 21 16 0 14 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -6 5 C 7 0 24 1 34 7 C 35 11 29 15 15 16 C -10 15 -13 8 -6 5 Z" } },
    { id: "rightUpperLeg", kind: "upper-leg", joint: "rightHip", layer: 43, variants: { side: { kind: "path", fill: "#b98265", d: "M -8 -4 C -13 8 -14 33 -9 50 C -6 58 5 58 8 50 C 14 33 15 8 8 -4 C 3 -7 -3 -7 -8 -4 Z" } }, shape: { kind: "path", fill: "#b98265", d: "M -12 -4 C -19 9 -18 34 -11 52 C -8 61 7 61 10 52 C 17 34 19 9 12 -4 C 5 -8 -5 -8 -12 -4 Z" } },
    { id: "rightForearm", kind: "forearm", joint: "rightElbow", layer: 50, shape: { kind: "path", fill: "#b98265", d: "M -5 -2 C -8 10 -9 30 -7 43 C -6 50 3 50 5 43 C 9 31 10 10 6 -2 C 2 1 -2 1 -5 -2 Z" } },
    { id: "rightHand", kind: "hand", joint: "rightWrist", layer: 51, shape: { kind: "path", fill: "#b98265", d: "M 1 -2 C -5 -1 -10 4 -9 10 C -7 17 0 21 5 17 C 10 13 11 5 7 0 Z" } },
    { id: "rightUpperArm", kind: "upper-arm", joint: "rightShoulder", layer: 52, shape: { kind: "path", fill: "#b98265", d: "M 0 -5 C -4 -5 -7 -2 -9 2 C -14 12 -14 32 -9 45 C -6 52 1 54 5 51 C 9 47 13 36 14 25 C 15 8 10 -5 0 -5 Z" } },
    { id: "neckPiece", kind: "body", joint: "neck", layer: 45, shape: { kind: "path", fill: "#b98265", d: "M -7 -18 C -4 -21 4 -21 7 -18 L 7 5 C 3 9 -3 9 -7 5 Z" } },
    { id: "headShape", kind: "head", joint: "head", layer: 60, shape: { kind: "path", fill: "#b98265", d: "M 0 -34 C 19 -34 30 -18 30 2 C 29 23 16 36 1 38 C -15 36 -29 23 -30 2 C -30 -18 -19 -34 0 -34 Z" } },
    { id: "hairBack", kind: "hair", joint: "head", layer: 59, shape: { kind: "path", fill: "#24342b", d: "M -36 -12 C -35 -52 35 -52 36 -12 C 40 22 25 54 0 58 C -25 54 -40 22 -36 -12 Z" } },
    { id: "hairFront", kind: "hair", joint: "head", layer: 67, shape: { kind: "path", fill: "#1d2a22", d: "M -30 -16 C -22 -45 24 -45 32 -14 C 18 -22 2 -24 -18 -18 C -24 -12 -28 -10 -30 -16 Z" } },
    { id: "face", kind: "face", joint: "head", layer: 68, shape: { kind: "ellipse", width: 46, height: 48, fill: "#b98265", offset: { x: 0, y: 5 } } }
  ],
  bodyPoints: [
    { id: "eyes", kind: "body", part: "face", position: { x: 0, y: -5 } },
    { id: "eyebrows", kind: "body", part: "face", position: { x: 0, y: -14 } },
    { id: "nose", kind: "body", part: "face", position: { x: 0, y: 3 } },
    { id: "mouth", kind: "body", part: "face", position: { x: 0, y: 17 } },
    { id: "hairFrontPoint", kind: "body", part: "hairFront", position: { x: 0, y: -28 } }
  ],
  outfitPoints: [
    { id: "hat", kind: "outfit", part: "headShape", position: { x: 0, y: -38 } },
    { id: "glasses", kind: "outfit", part: "face", position: { x: 0, y: -5 } },
    { id: "earrings", kind: "outfit", part: "headShape", position: { x: 32, y: 4 } },
    { id: "neckAccessory", kind: "outfit", part: "neckPiece", position: { x: 0, y: 4 } },
    { id: "garmentTop", kind: "outfit", part: "torso", position: { x: 0, y: -15 } },
    { id: "belt", kind: "outfit", part: "torso", position: { x: 0, y: 34 } },
    { id: "pantTop", kind: "outfit", part: "torso", position: { x: 0, y: 46 } },
    { id: "leftSleeveTop", kind: "outfit", part: "leftUpperArm", position: { x: 0, y: 6 } },
    { id: "rightSleeveTop", kind: "outfit", part: "rightUpperArm", position: { x: 0, y: 6 } },
    { id: "leftWristAccessory", kind: "outfit", part: "leftHand", position: { x: 0, y: -8 } },
    { id: "rightWristAccessory", kind: "outfit", part: "rightHand", position: { x: 0, y: -8 } },
    { id: "leftShoe", kind: "outfit", part: "leftFoot", position: { x: 17, y: 2 } },
    { id: "rightShoe", kind: "outfit", part: "rightFoot", position: { x: 17, y: 2 } }
  ],
  outfits: [
    {
      id: "greenRunway",
      name: "Green Runway",
      items: [
        { id: "greenShoesLeft", point: "leftShoe", layer: 22, shape: { kind: "ellipse", width: 36, height: 16, fill: "#17613a", offset: { x: 0, y: 0 } } },
        { id: "greenShoesRight", point: "rightShoe", layer: 42, shape: { kind: "ellipse", width: 36, height: 16, fill: "#17613a", offset: { x: 0, y: 0 } } },
        { id: "greenTop", point: "garmentTop", layer: 34, shape: { kind: "path", fill: "#58b66f", d: "M -30 -28 C -36 -5 -34 28 -20 42 L 20 42 C 34 28 36 -5 30 -28 C 12 -38 -12 -38 -30 -28 Z" } },
        { id: "greenBelt", point: "belt", layer: 35, shape: { kind: "rect", width: 62, height: 8, fill: "#17613a", offset: { x: 0, y: 0 } } }
      ]
    },
    {
      id: "sunnyStudio",
      name: "Sunny Studio",
      items: [
        { id: "blueShoesLeft", point: "leftShoe", layer: 22, shape: { kind: "ellipse", width: 34, height: 16, fill: "#3177a4", offset: { x: 0, y: 0 } } },
        { id: "blueShoesRight", point: "rightShoe", layer: 42, shape: { kind: "ellipse", width: 34, height: 16, fill: "#3177a4", offset: { x: 0, y: 0 } } },
        { id: "yellowTop", point: "garmentTop", layer: 34, shape: { kind: "path", fill: "#f0c34e", d: "M -32 -27 C -39 -2 -35 20 -22 38 L 22 38 C 35 20 39 -2 32 -27 C 10 -34 -10 -34 -32 -27 Z" } },
        { id: "blueBelt", point: "belt", layer: 35, shape: { kind: "rect", width: 58, height: 8, fill: "#3177a4", offset: { x: 0, y: 0 } } }
      ]
    },
    {
      id: "nightGarden",
      name: "Night Garden",
      items: [
        { id: "gardenShoesLeft", point: "leftShoe", layer: 22, shape: { kind: "ellipse", width: 36, height: 16, fill: "#1f6f6b", offset: { x: 0, y: 0 } } },
        { id: "gardenShoesRight", point: "rightShoe", layer: 42, shape: { kind: "ellipse", width: 36, height: 16, fill: "#1f6f6b", offset: { x: 0, y: 0 } } },
        { id: "gardenDress", point: "garmentTop", layer: 34, shape: { kind: "path", fill: "#1f6f6b", d: "M -30 -28 C -40 0 -48 50 -34 82 L 34 82 C 48 50 40 0 30 -28 C 12 -38 -12 -38 -30 -28 Z" } },
        { id: "gardenBelt", point: "belt", layer: 35, shape: { kind: "rect", width: 64, height: 8, fill: "#a8d66d", offset: { x: 0, y: 0 } } }
      ]
    }
  ],
  accessories: [
    { id: "leafHat", name: "Leaf Hat", point: "hat", layer: 80, shape: { kind: "path", fill: "#58b66f", d: "M -34 -4 C -6 -34 34 -20 38 0 C 18 12 -16 16 -34 -4 Z" } },
    { id: "roundGlasses", name: "Round Glasses", point: "glasses", layer: 82, shape: { kind: "path", fill: "none", stroke: "#26362c", d: "M -23 0 A 9 9 0 1 0 -5 0 A 9 9 0 1 0 -23 0 M 5 0 A 9 9 0 1 0 23 0 A 9 9 0 1 0 5 0 M -5 0 L 5 0" } },
    { id: "wristSparkle", name: "Wrist Sparkle", point: "rightWristAccessory", layer: 53, shape: { kind: "circle", radius: 7, fill: "#f0c34e", offset: { x: 0, y: 0 } } },
    { id: "tinyBag", name: "Tiny Bag", point: "leftWristAccessory", layer: 13, shape: { kind: "path", fill: "#c95067", d: "M -12 -8 C -8 -20 8 -20 12 -8 M -16 -8 L 16 -8 L 12 18 L -12 18 Z" } }
  ],
  visibilitySets: {
    standing: { show: [], hide: ["face", "hairBack", "hairFront"] },
    walking: {
      show: [],
      hide: ["face", "hairBack", "hairFront"],
      variants: {
        leftUpperLeg: "side",
        rightUpperLeg: "side",
        leftLowerLeg: "side",
        rightLowerLeg: "side"
      }
    },
    fashionPose: { show: [], hide: ["face", "hairBack", "hairFront"] }
  },
  clips: [
    { id: "chillClip", kind: "idle", visibilitySet: "standing", jointTurns: {} },
    { id: "walkLeftClip", kind: "walk", intent: "left", facing: "left", visibilitySet: "walking", loops: true, phaseOffset: 0.25, rootMotion: { x: -22, y: 0 }, travelMotion: { x: 58, y: 0 }, travelDurationMs: 5200, variants: { leftFoot: "left", rightFoot: "left" }, pointPositions: { leftShoe: { x: -17, y: 2 }, rightShoe: { x: -17, y: 2 } }, jointTurns: { leftHip: 14, rightHip: -14, leftKnee: -24, rightKnee: 24, leftShoulder: -12, rightShoulder: 12, leftElbow: 18, rightElbow: -18 } },
    { id: "walkRightClip", kind: "walk", intent: "right", facing: "right", visibilitySet: "walking", loops: true, phaseOffset: 0.25, rootMotion: { x: 22, y: 0 }, travelMotion: { x: 58, y: 0 }, travelDurationMs: 5200, variants: { leftFoot: "right", rightFoot: "right" }, pointPositions: { leftShoe: { x: 17, y: 2 }, rightShoe: { x: 17, y: 2 } }, jointTurns: { leftHip: -14, rightHip: 14, leftKnee: -24, rightKnee: 24, leftShoulder: 12, rightShoulder: -12, leftElbow: 18, rightElbow: -18 } },
    { id: "runwayPoseTwoClip", kind: "pose", visibilitySet: "fashionPose", jointTurns: { neck: 8, leftShoulder: 28, rightShoulder: -34, leftElbow: -18, rightHip: -12 } },
    { id: "waveClip", kind: "gesture", visibilitySet: "standing", loops: true, durationMs: 760, holdTurns: { rightShoulder: -52, rightElbow: -26 }, jointTurns: { rightElbow: -10, rightWrist: 22 } }
  ],
  moves: [
    { id: "chill", name: "Chill", clip: "chillClip" },
    { id: "walk", name: "Walk", clips: { left: "walkLeftClip", right: "walkRightClip" }, defaultDirection: "right" },
    { id: "runwayPoseTwo", name: "Runway Pose", clip: "runwayPoseTwoClip" },
    { id: "wave", name: "Wave", clip: "waveClip" }
  ]
};
