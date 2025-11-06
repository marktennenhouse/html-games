// piano-input-mapper.js - Reusable State-Based Piano Input Class

class PianoInputMapper {
    constructor(config = {}) {
        // Configuration options
        this.config = {
            mode: config.mode || 'Note',        // 'Note' or 'Chord'
            
            // Note mode config
            upNote: config.upNote || 'C',       // Actual note name
            downNote: config.downNote || 'G',   // Actual note name
            
            // Chord mode config
            upChord: config.upChord || 'C',     // Root note
            upChordType: config.upChordType || 'Major',
            downChord: config.downChord || 'G',
            downChordType: config.downChordType || 'Major'
        };
        
        // Simple state - game just reads this!
        this.state = {
            up: false,
            down: false
        };
        
        this.activeNotes = new Set();
        this.midiAccess = null;
        this.connectedDevices = [];
        this.isConnected = false;
        
        // Callbacks for connection events
        this.onConnectionChange = null;
        
        // Music theory lookup tables
        this.noteToMidi = {
            'C': 0, 'C#': 1, 'Db': 1,
            'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8,
            'A': 9, 'A#': 10, 'Bb': 10,
            'B': 11
        };
        
        this.chordPatterns = {
            'Major': [0, 4, 7],      // Major triad
            'Minor': [0, 3, 7],      // Minor triad
            'Diminished': [0, 3, 6], // Diminished
            'Augmented': [0, 4, 8]   // Augmented
        };
    }
    
    async init() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            
            // Listen for device connection/disconnection
            this.midiAccess.onstatechange = this.handleConnectionChange.bind(this);
            
            // Get initial devices
            this.updateDeviceList();
            
            if (this.connectedDevices.length === 0) {
                console.warn('No MIDI devices found');
                this.isConnected = false;
                return false;
            }
            
            this.isConnected = true;
            console.log('Piano Input Mapper initialized');
            console.log('Connected devices:', this.connectedDevices.map(d => d.name).join(', '));
            console.log('Config:', this.getConfigDescription());
            return true;
        } catch (error) {
            console.error('MIDI not available:', error);
            this.isConnected = false;
            return false;
        }
    }
    
    // Update list of connected devices
    updateDeviceList() {
        this.connectedDevices = [];
        const inputs = this.midiAccess.inputs.values();
        
        for (let input of inputs) {
            if (input.state === 'connected') {
                this.connectedDevices.push({
                    id: input.id,
                    name: input.name || 'Unknown Device',
                    manufacturer: input.manufacturer || 'Unknown',
                    state: input.state
                });
                input.onmidimessage = this.handleMIDI.bind(this);
            }
        }
        
        this.isConnected = this.connectedDevices.length > 0;
    }
    
    // Handle device connection/disconnection
    handleConnectionChange(event) {
        console.log('MIDI device state changed:', event.port.name, event.port.state);
        this.updateDeviceList();
        
        // Trigger callback if set
        if (this.onConnectionChange) {
            this.onConnectionChange({
                connected: this.isConnected,
                devices: this.connectedDevices,
                event: event
            });
        }
    }
    
    // Handle MIDI input
    handleMIDI(message) {
        const [status, note, velocity] = message.data;
        
        // Note on
        if (status === 144 && velocity > 0) {
            this.activeNotes.add(note);
        }
        // Note off
        else if (status === 128 || (status === 144 && velocity === 0)) {
            this.activeNotes.delete(note);
        }
        
        // Update state based on config
        this.updateState();
    }
    
    // The magic happens here - detects based on mode
    updateState() {
        if (this.config.mode === 'Note') {
            this.state.up = this.isNotePressed(this.config.upNote);
            this.state.down = this.isNotePressed(this.config.downNote);
        } else {
            this.state.up = this.isChordPressed(this.config.upChord, this.config.upChordType);
            this.state.down = this.isChordPressed(this.config.downChord, this.config.downChordType);
        }
    }
    
    // Check if a specific note is pressed (any octave)
    isNotePressed(noteName) {
        const noteValue = this.noteToMidi[noteName];
        if (noteValue === undefined) return false;
        
        // Check if any active note matches (any octave)
        for (let midiNote of this.activeNotes) {
            if (midiNote % 12 === noteValue) {
                return true;
            }
        }
        return false;
    }
    
    // Check if a specific chord is pressed
    isChordPressed(rootNote, chordType) {
        const rootValue = this.noteToMidi[rootNote];
        if (rootValue === undefined) return false;
        
        const pattern = this.chordPatterns[chordType];
        if (!pattern) return false;
        
        // Build expected chord notes (normalized to 0-11)
        const expectedNotes = pattern.map(interval => (rootValue + interval) % 12);
        
        // Get active notes (normalized to 0-11)
        const activeNormalized = Array.from(this.activeNotes).map(n => n % 12);
        
        // Check if all expected notes are present
        const allPresent = expectedNotes.every(note => activeNormalized.includes(note));
        
        // Also check we don't have extra notes (strict chord matching)
        const noExtras = activeNormalized.length === expectedNotes.length;
        
        return allPresent && noExtras;
    }
    
    // Game reads these
    get up() { return this.state.up; }
    get down() { return this.state.down; }
    
    // Update configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.updateState(); // Recheck with new config
    }
    
    // Human-readable description
    getConfigDescription() {
        if (this.config.mode === 'Note') {
            return `Note Mode: Up=${this.config.upNote}, Down=${this.config.downNote}`;
        } else {
            return `Chord Mode: Up=${this.config.upChord} ${this.config.upChordType}, Down=${this.config.downChord} ${this.config.downChordType}`;
        }
    }
    
    // Get connection status info
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            deviceCount: this.connectedDevices.length,
            devices: this.connectedDevices,
            deviceNames: this.connectedDevices.map(d => d.name).join(', ') || 'None'
        };
    }
}

