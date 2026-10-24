/**
 * Mock Remediation Configurations
 *
 * Provides at least 6 diverse configurations across themes, operations,
 * and game types for development, testing, and teacher/parent preview.
 */

export const MOCK_CONFIGS = [
  // 1. Dinosaurs Addition - Order Steps
  {
    id: 'dino-addition-order',
    name: '1. Dino Eggs Addition (Order Steps)',
    gameType: 'order_steps',
    theme: 'dinosaurs',
    companion: { key: 'rex', name: 'Rex the Dino' },
    problem: { a: 3, b: 2, op: '+' },
    objectKey: 'dino_egg',
    steps: [
      { id: 's1', label: 'Count first 3 dino eggs', iconKey: 'dino_egg' },
      { id: 's2', label: 'Count next 2 dino eggs', iconKey: 'baby_dino' },
      { id: 's3', label: 'Count all 5 eggs together!', iconKey: 'star' }
    ],
    voiceLines: {
      intro: "Roar! Let's arrange our secret steps to count the dino eggs!",
      hint: "Almost! Think which step we start with first.",
      assist: "I'll guide this step right here! You've got this.",
      success: "Dino-mite! 3 eggs plus 2 eggs make 5 eggs in total!"
    }
  },

  // 2. Space Subtraction - Order Steps
  {
    id: 'space-subtraction-order',
    name: '2. Cosmic Rocket Subtraction (Order Steps)',
    gameType: 'order_steps',
    theme: 'space',
    companion: { key: 'luna', name: 'Luna the Owl' },
    problem: { a: 5, b: 2, op: '-' },
    objectKey: 'rocket',
    steps: [
      { id: 's1', label: 'Start with all 5 rockets', iconKey: 'rocket' },
      { id: 's2', label: 'Fly 2 rockets away into space', iconKey: 'star' },
      { id: 's3', label: 'Count the 3 rockets left behind', iconKey: 'star' }
    ],
    voiceLines: {
      intro: "3, 2, 1, blast off! Let's put our subtraction steps in order.",
      hint: "Almost! We always start with all the rockets first.",
      assist: "Let's place this rocket step right into slot 1!",
      success: "Mission accomplished! 5 rockets minus 2 leaves 3 rockets!"
    }
  },

  // 3. Cars Addition - Order Steps
  {
    id: 'cars-addition-order',
    name: '3. Speedway Wheels Addition (Order Steps)',
    gameType: 'order_steps',
    theme: 'cars',
    companion: { key: 'barnaby', name: 'Barnaby the Crab' },
    problem: { a: 4, b: 2, op: '+' },
    objectKey: 'wheel',
    steps: [
      { id: 's1', label: 'Count 4 racing wheels', iconKey: 'wheel' },
      { id: 's2', label: 'Add 2 spare wheels', iconKey: 'car' },
      { id: 's3', label: 'Count all 6 wheels in the pit stop!', iconKey: 'car' }
    ],
    voiceLines: {
      intro: "Ready, set, go! Let's order the pit stop steps!",
      hint: "Almost there, racer! Try placing this step earlier.",
      assist: "Here comes the pit crew! Let's put this step here.",
      success: "Green flag! 4 wheels plus 2 wheels makes 6 wheels!"
    }
  },

  // 4. Animals Addition - Match Pairs
  {
    id: 'animals-addition-match',
    name: '4. Safari Paw Prints (Match Pairs)',
    gameType: 'match_pairs',
    theme: 'animals',
    companion: { key: 'pip', name: 'Pip the Otter' },
    problem: { a: 2, b: 3, op: '+' },
    objectKey: 'animal_paw',
    pairs: [
      { id: 'p1', left: { type: 'numeral', value: 2 }, right: { type: 'objects', objectKey: 'animal_paw', count: 2 } },
      { id: 'p2', left: { type: 'numeral', value: 3 }, right: { type: 'objects', objectKey: 'animal_paw', count: 3 } },
      { id: 'p3', left: { type: 'numeral', value: 5 }, right: { type: 'objects', objectKey: 'animal_paw', count: 5 } }
    ],
    voiceLines: {
      intro: "Splash! Match each number to its friendly paw prints!",
      hint: "Count each paw print carefully with your finger.",
      assist: "Look at the glowing number and group! They belong together.",
      success: "Pawsome! 2 paws and 3 paws make 5 paws!"
    }
  },

  // 5. Football Subtraction - Match Pairs
  {
    id: 'football-subtraction-match',
    name: '5. Champion Footballs (Match Pairs)',
    gameType: 'match_pairs',
    theme: 'football',
    companion: { key: 'barnaby', name: 'Barnaby the Crab' },
    problem: { a: 6, b: 2, op: '-' },
    objectKey: 'football',
    pairs: [
      { id: 'p1', left: { type: 'numeral', value: 6 }, right: { type: 'objects', objectKey: 'football', count: 6 } },
      { id: 'p2', left: { type: 'numeral', value: 2 }, right: { type: 'objects', objectKey: 'football', count: 2 } },
      { id: 'p3', left: { type: 'numeral', value: 4 }, right: { type: 'objects', objectKey: 'football', count: 4 } }
    ],
    voiceLines: {
      intro: "Kick-off! Connect each jersey number to the soccer balls!",
      hint: "Take your time! Count the balls one by one.",
      assist: "I'll pass to this glowing match! Tap them together.",
      success: "GOOOAL! 6 balls take away 2 leaves 4 balls on the field!"
    }
  },

  // 6. Drawing Studio Addition - Match Pairs
  {
    id: 'drawing-addition-match',
    name: '6. Art Studio Crayon Pencils (Match Pairs)',
    gameType: 'match_pairs',
    theme: 'drawing',
    companion: { key: 'luna', name: 'Luna the Owl' },
    problem: { a: 3, b: 3, op: '+' },
    objectKey: 'pencil',
    pairs: [
      { id: 'p1', left: { type: 'numeral', value: 3 }, right: { type: 'objects', objectKey: 'pencil', count: 3 } },
      { id: 'p2', left: { type: 'numeral', value: 4 }, right: { type: 'objects', objectKey: 'pencil', count: 4 } },
      { id: 'p3', left: { type: 'numeral', value: 6 }, right: { type: 'objects', objectKey: 'pencil', count: 6 } }
    ],
    voiceLines: {
      intro: "Let's color! Match the pencil numbers to their crayon cups!",
      hint: "Count each crayon carefully! You're very close.",
      assist: "Watch this glowing pair light up! Tap to link them.",
      success: "Masterpiece! All pencils are organized and ready to draw!"
    }
  }
];
