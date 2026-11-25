// English: the game's own text. Each world's text is in its module (`strings`). See ./CLAUDE.md.
export default {
  title: 'Portal Runner',
  loading: 'Shaping worlds…',

  menu: {
    lead: 'Every portal opens onto a world no one has mapped. Each hides dark gems, and something lives there that won\'t let you take them easily.',
    loopLabel: 'How a world works',
    loop1: 'Hunt the dark gems hidden in every world.',
    loop2: 'Carry them to the portal. Each one slows you down.',
    loop3: 'Fill the portal and step through to the next world.',
    start: 'Begin the expedition',
    settings: 'Settings',
    controlsPc: '<b>{key:wasd}</b> to move, <b>{key:shift}</b> to run, drag to look, <b>{key:q}</b> to drop a gem, <b>{key:space}</b> to take things, <b>wheel</b> to pick and <b>{key:space}</b> to read what you find, <b>{key:esc}</b> to pause',
    controlsTouch: 'Left thumb moves (push to the edge to run), right thumb looks, the tool buttons above the right thumb drop a gem, take things and open what you find',
  },

  settings: {
    title: 'Settings',
    general: 'General',
    language: 'Language',
    footsteps: 'Footstep sounds',
    debug: 'Debug mode',
    debugHint: 'Start every world already holding all its items (the note, the map).',
    applyNext: 'Changes apply from the next run.',
    done: 'Done',
    reset: 'Reset to defaults',
    decrease: 'Decrease {name}',
    increase: 'Increase {name}',
    runSpeed: { label: 'Base speed V', hint: 'Your running speed. Walking (V/2) and every hunter speed scale with it.' },
    slowPerGem: { label: 'Speed lost per gem', hint: 'Each gem you carry removes this share of V, never below {min}%. Now: {carry}% with 1 / 2 / 3 gems.' },
    safeRadius: { label: 'Portal safe radius', hint: 'In every world, inside this distance from the portal (the faint ring) hunters can\'t follow you or come in. 0 = no safe zone.' },
    lives: { label: 'Lives' },
    gems: { label: 'Gems needed', hint: 'Gems to bring to the portal. Exactly this many are hidden in the world.' },
  },

  // a value with its unit
  units: { m: '{n} m', s: '{n} s', mps: '{n} m/s', pct: '{n}%' },

  pause: { title: 'Paused', resume: 'Resume', quit: 'Quit to menu' },

  end: {
    win: 'You made it home',
    lose: 'Caught',
    winText: 'Three worlds crossed. The way home closes behind you.',
    loseText: '{hunter} got you in {world}.',
    again: 'Play again',
    menu: 'Menu',
    time: 'Time',
    livesLeft: 'Lives left',
    world: 'World',
    delivered: 'Gems delivered',
    caught: 'Caught',
    none: '—',
  },

  rotate: {
    title: 'Portal Runner plays sideways',
    touch: 'Turn your device to landscape. If it doesn\'t rotate, switch off rotation lock.',
    pc: 'Make the window wider than it is tall.',
  },

  hud: {
    inPortal: 'in the portal',
    sound: 'Sound',
    pause: 'Pause',
    action: 'Action',
    note: 'Note',
    map: 'Map',
    dropGem: 'Drop gem',
    dropGemAria: 'Drop a gem',
    dropGemTitle: 'Drop a gem ({key:q})',
    close: 'Close',
    closeItem: 'Close {item}',
    calling: 'Calling',
    callingRadius: 'Calling… {r} m',
    answered: { one: '{count} gem answered · {r} m', other: '{count} gems answered · {r} m' },
    nothingInRange: 'Nothing in range — follow the trail',
  },

  // contextual actions shared by every world (a world's own actions go in its `strings`)
  actions: { takeNote: 'Take the note', takeMap: 'Take the map' },

  toast: {
    callTouch: 'Let go of the stick to send a Resonance Call',
    callPc: 'Stand still to send a Resonance Call',
    firstGem: 'This gem is slowing me down...',
    // the catch toast, joined with ' · '
    caught: { one: '{hunter} caught you — {count} life left', other: '{hunter} caught you — {count} lives left' },
    dropped: { one: '{count} gem dropped', other: '{count} gems dropped' },
  },

  map: {
    you: 'You',
    gems: 'Gems',
    portal: 'Portal',
    iceHole: 'Ice hole',
    turn: 'Turn',
    north: 'N',
    // how to use the chart: a gesture, then what it does
    pinch: 'Pinch', wheel: 'Wheel', drag: 'Drag', doubleTap: 'Double tap', doubleClick: 'Double-click',
    zoom: 'zoom', move: 'move', reset: 'reset',
  },
};
