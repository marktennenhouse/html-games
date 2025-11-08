# Flappy Bird Game

A browser-based Flappy Bird clone with adjustable speed controls and optional piano input.

## Branches

This repository contains two versions of the game:

### `master` Branch - Original Single-Input Version
- **Controls**: Single button input (UP ARROW or SPACE)
- **Physics**: Jump-based with gravity
- **Files**: `index.html`, `style.css`, `game.js`
- **Features**:
  - Adjustable game speed (0.5x to 2.0x)
  - Colorful graphics with gradient backgrounds
  - Bird with eye and beak details
  - Green pipes with highlights
  - Collision detection

### `piano-input` Branch - Piano/MIDI Version with 2-Way Controls
- **Controls**: Two-way movement (UP and DOWN arrows, or piano/MIDI input)
- **Physics**: Momentum-based with thrust and drag
- **Files**: `index.html`, `style.css`, `game.js`, `piano-input-mapper.js`
- **Features**:
  - All features from original version
  - Piano configuration UI
  - MIDI input support via Web MIDI API
  - Note mode: Single notes trigger up/down
  - Chord mode: Chords trigger up/down
  - Supports all 12 notes and chord types (Major, Minor, Diminished, Augmented)
- Optional performance tracking via the Piano Skill Tracker API (`piano-tracker.js`)
  - Keyboard fallback if no MIDI device available
  - Reusable `PianoInputMapper` class for other games

## How to Play

### Original Version (master branch)
1. Open `index.html` in a web browser
2. Adjust game speed if desired
3. Click "Start Game"
4. Press UP ARROW or SPACE to make the bird jump
5. Avoid pipes, ground, and ceiling

### Piano Version (piano-input branch)
1. Open `index.html` in a web browser
2. Configure piano input (or skip to use keyboard)
   - Choose Note or Chord mode
   - Select which notes/chords control up and down
   - (Optional) Ensure the Piano Skill Tracker API is reachable if you want performance logs
3. Adjust game speed if desired
4. Click "Start Game"
5. Use UP/DOWN arrows or your configured piano input to control the bird
6. Avoid pipes, ground, and ceiling

## Switching Between Versions

```bash
# Switch to original version
git checkout master

# Switch to piano version
git checkout piano-input
```

## Technical Details

### Original Version
- Single-action jump mechanic
- Gravity: 0.25
- Jump strength: -4
- Canvas size: 400x600

### Piano Version
- Momentum-based physics
- Up thrust: -0.5
- Down thrust: 0.5
- Light gravity: 0.15 (when no input)
- Max velocity: 5
- Velocity drag: 0.98x per frame
- State-based input system
- MIDI input via Web MIDI API

## Performance Tracking Integration

The piano build includes optional reporting through the Piano Skill Tracker system:

- `piano-tracker.js` is bundled locally (copied from the tracker game's integration package).  
- Configure the API endpoint and identifiers inside the `TRACKING_SETTINGS` block in `game.js`.
- When MIDI input is active and the tracker configuration resolves expected note/chord IDs, the game:
  - Starts a tracker session alongside each gameplay run.
  - Records every detected up/down action with its expected and played note/chord IDs.
  - Ends the session with aggregate success/error counts so you can generate performance reports (session detail, mastery, transition analysis, etc.).
- If the API is unreachable or IDs cannot be resolved, the tracking layer disables itself automatically.

> Tip: run the Piano Skill Tracker backend locally (default `http://localhost:5000`) or adjust the base URL to match your deployment. The tracker expects reference data (keys, chords, progressions) to already exist in the piano system database.

## Browser Compatibility

- Chrome/Edge: Full support (including MIDI)
- Firefox: Full support (including MIDI)
- Safari: Full support (including MIDI with user permission)

## License

Free to use and modify.

