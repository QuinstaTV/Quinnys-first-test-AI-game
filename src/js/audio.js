/* ============================================================
   audio.js - Procedural audio via Web Audio API
   SFX: shoot, cannon, explosion, engine
   Music: Classical-inspired themes per vehicle (Mars, Ride of
   the Valkyries feel, etc.) using oscillators
   ============================================================ */
(function () {
  'use strict';

  let audioCtx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicEnabled = true;
  let sfxEnabled = true;
  let currentMusic = null;
  let initialized = false;

  function init() {
    if (initialized) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(audioCtx.destination);

      sfxGain = audioCtx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(masterGain);

      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.25;
      musicGain.connect(masterGain);

      initialized = true;
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  function resume() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  /* ---------- SFX ---------- */
  function play(name) {
    if (!initialized || !sfxEnabled) return;
    resume();

    switch (name) {
      case 'shoot': sfxShoot(); break;
      case 'cannon': sfxCannon(); break;
      case 'explosion': sfxExplosion(); break;
      case 'pickup': sfxPickup(); break;
      case 'score': sfxScore(); break;
      case 'click': sfxClick(); break;
      case 'fuelwarn': sfxFuelWarn(); break;
      case 'engine': break; // continuous, handled separately
    }
  }

  function sfxShoot() {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);

    // Noise burst
    playNoise(0.03, 0.2, now);
  }

  function sfxCannon() {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    playNoise(0.08, 0.35, now);
  }

  function sfxExplosion() {
    const now = audioCtx.currentTime;
    // Low boom
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);

    // Crackle noise
    playNoise(0.3, 0.5, now);
    playNoise(0.15, 0.3, now + 0.1);
  }

  function sfxPickup() {
    const now = audioCtx.currentTime;
    const freqs = [523, 659, 784]; // C5, E5, G5
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }

  function sfxScore() {
    const now = audioCtx.currentTime;
    const freqs = [523, 659, 784, 1047]; // C5, E5, G5, C6
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.25, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  }

  function sfxClick() {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  function sfxFuelWarn() {
    const now = audioCtx.currentTime;
    // Urgent double-beep warning
    for (let i = 0; i < 2; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 800;
      const t = now + i * 0.15;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  function playNoise(duration, vol, startTime) {
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    noise.connect(gain);
    gain.connect(sfxGain);
    noise.start(startTime);
  }

  /* ---------- MUSIC ---------- */
  // Army/rock-style 16-bit chiptune music
  // Fortunate Son-inspired driving rock with pentatonic riffs
  // Each vehicle gets a unique rock variation

  // Note frequencies for reference:
  // E2=82 A2=110 B2=123 D3=147 E3=165 G3=196 A3=220 B3=247
  // D4=294 E4=330 G4=392 A4=440 B4=494 D5=587 E5=659 G5=784

  const THEMES = {
    // Jeep: Fast punk-rock, Fortunate Son-inspired E-based riff
    [Game.VEH.JEEP]: {
      tempo: 160,
      notes: [
        // Driving E pentatonic rock riff
        { f: 330, d: 0.5 }, { f: 392, d: 0.5 }, { f: 440, d: 0.5 }, { f: 330, d: 0.5 },
        { f: 392, d: 0.5 }, { f: 494, d: 0.5 }, { f: 440, d: 0.5 }, { f: 392, d: 0.5 },
        { f: 330, d: 1 }, { f: 294, d: 0.5 }, { f: 330, d: 0.5 },
        { f: 392, d: 0.5 }, { f: 440, d: 0.5 }, { f: 392, d: 1 },
        // Verse riff variation
        { f: 330, d: 0.5 }, { f: 330, d: 0.25 }, { f: 392, d: 0.25 }, { f: 440, d: 0.5 }, { f: 494, d: 0.5 },
        { f: 659, d: 1 }, { f: 494, d: 0.5 }, { f: 440, d: 0.5 },
        { f: 392, d: 0.5 }, { f: 330, d: 0.5 }, { f: 294, d: 0.5 }, { f: 330, d: 0.5 },
        { f: 247, d: 1 }, { f: 330, d: 1 }
      ],
      wave: 'square',
      bassNotes: [
        // Driving bass with shuffle feel
        { f: 82, d: 0.5 }, { f: 82, d: 0.5 }, { f: 110, d: 0.5 }, { f: 82, d: 0.5 },
        { f: 110, d: 0.5 }, { f: 110, d: 0.5 }, { f: 123, d: 0.5 }, { f: 110, d: 0.5 },
        { f: 82, d: 0.5 }, { f: 82, d: 0.5 }, { f: 82, d: 0.5 }, { f: 110, d: 0.5 },
        { f: 123, d: 0.5 }, { f: 110, d: 0.5 }, { f: 82, d: 1 },
        { f: 82, d: 0.5 }, { f: 82, d: 0.5 }, { f: 110, d: 0.5 }, { f: 123, d: 0.5 },
        { f: 165, d: 0.5 }, { f: 123, d: 0.5 }, { f: 110, d: 0.5 }, { f: 82, d: 0.5 },
        { f: 82, d: 0.5 }, { f: 82, d: 0.5 }, { f: 110, d: 0.5 }, { f: 82, d: 0.5 }
      ],
      drums: [
        // Fast driving beat: kick-hat-snare-hat
        { type: 'kick', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'snare', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'kick', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'snare', d: 0.5 }, { type: 'hat', d: 0.25 }, { type: 'hat', d: 0.25 }
      ]
    },
    // BushMaster (Tank): Heavy metal, slow grinding power chords
    [Game.VEH.TANK]: {
      tempo: 110,
      notes: [
        // Heavy power chord riff in E
        { f: 165, d: 1 }, { f: 165, d: 0.5 }, { f: 165, d: 0.5 },
        { f: 196, d: 0.5 }, { f: 220, d: 0.5 }, { f: 196, d: 1 },
        { f: 165, d: 0.5 }, { f: 147, d: 0.5 }, { f: 165, d: 1 },
        { f: 0, d: 0.5 }, { f: 165, d: 0.5 },
        // Heavy breakdown
        { f: 147, d: 1 }, { f: 147, d: 0.5 }, { f: 165, d: 0.5 },
        { f: 196, d: 1 }, { f: 220, d: 0.5 }, { f: 247, d: 0.5 },
        { f: 220, d: 1 }, { f: 196, d: 0.5 }, { f: 165, d: 0.5 },
        { f: 147, d: 1 }, { f: 165, d: 1 }
      ],
      wave: 'sawtooth',
      bassNotes: [
        // Chugging palm-mute style bass
        { f: 82, d: 0.5 }, { f: 82, d: 0.25 }, { f: 82, d: 0.25 }, { f: 82, d: 0.5 }, { f: 82, d: 0.5 },
        { f: 98, d: 0.5 }, { f: 110, d: 0.5 }, { f: 98, d: 1 },
        { f: 82, d: 0.5 }, { f: 73, d: 0.5 }, { f: 82, d: 1 },
        { f: 73, d: 0.5 }, { f: 73, d: 0.5 }, { f: 82, d: 0.5 }, { f: 82, d: 0.5 },
        { f: 98, d: 1 }, { f: 110, d: 0.5 }, { f: 123, d: 0.5 },
        { f: 110, d: 1 }, { f: 98, d: 0.5 }, { f: 82, d: 0.5 },
        { f: 73, d: 1 }, { f: 82, d: 1 }
      ],
      drums: [
        // Heavy stomp beat
        { type: 'kick', d: 0.5 }, { type: 'kick', d: 0.5 },
        { type: 'snare', d: 1 },
        { type: 'kick', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'snare', d: 0.5 }, { type: 'kick', d: 0.5 }
      ]
    },
    // UrbanStrike: Action movie helicopter theme, driving 80s rock
    [Game.VEH.HELI]: {
      tempo: 140,
      notes: [
        // 80s action rock lead - soaring pentatonic
        { f: 440, d: 0.5 }, { f: 494, d: 0.5 }, { f: 587, d: 1 },
        { f: 494, d: 0.5 }, { f: 440, d: 0.5 }, { f: 392, d: 1 },
        { f: 440, d: 0.5 }, { f: 587, d: 0.5 }, { f: 659, d: 1 },
        { f: 587, d: 0.5 }, { f: 494, d: 0.5 }, { f: 440, d: 1 },
        // Heroic ascending phrase
        { f: 330, d: 0.5 }, { f: 392, d: 0.5 }, { f: 440, d: 0.5 }, { f: 494, d: 0.5 },
        { f: 587, d: 1 }, { f: 659, d: 1 },
        { f: 784, d: 1.5 }, { f: 659, d: 0.5 },
        { f: 587, d: 0.5 }, { f: 494, d: 0.5 }, { f: 440, d: 1 },
        { f: 392, d: 1 }, { f: 440, d: 1 }
      ],
      wave: 'square',
      bassNotes: [
        // Driving eighth-note bass
        { f: 110, d: 0.5 }, { f: 110, d: 0.5 }, { f: 110, d: 0.5 }, { f: 123, d: 0.5 },
        { f: 98, d: 0.5 }, { f: 98, d: 0.5 }, { f: 98, d: 0.5 }, { f: 110, d: 0.5 },
        { f: 110, d: 0.5 }, { f: 110, d: 0.5 }, { f: 147, d: 0.5 }, { f: 165, d: 0.5 },
        { f: 147, d: 0.5 }, { f: 123, d: 0.5 }, { f: 110, d: 1 },
        { f: 82, d: 0.5 }, { f: 98, d: 0.5 }, { f: 110, d: 0.5 }, { f: 123, d: 0.5 },
        { f: 147, d: 1 }, { f: 165, d: 1 },
        { f: 196, d: 1 }, { f: 165, d: 0.5 }, { f: 147, d: 0.5 },
        { f: 123, d: 0.5 }, { f: 110, d: 0.5 }, { f: 98, d: 0.5 }, { f: 110, d: 0.5 }
      ],
      drums: [
        // Driving rock with ride cymbal feel
        { type: 'kick', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'snare', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'kick', d: 0.5 }, { type: 'kick', d: 0.5 },
        { type: 'snare', d: 0.5 }, { type: 'hat', d: 0.5 }
      ]
    },
    // StrikeMaster: Industrial/military march rock
    [Game.VEH.ASV]: {
      tempo: 100,
      notes: [
        // Industrial march riff - heavy and methodical
        { f: 147, d: 1 }, { f: 165, d: 0.5 }, { f: 196, d: 0.5 },
        { f: 220, d: 1 }, { f: 196, d: 1 },
        { f: 165, d: 0.5 }, { f: 147, d: 0.5 }, { f: 131, d: 1 },
        { f: 147, d: 1 }, { f: 0, d: 0.5 }, { f: 147, d: 0.5 },
        // Power riff
        { f: 196, d: 1 }, { f: 220, d: 0.5 }, { f: 247, d: 0.5 },
        { f: 294, d: 1 }, { f: 247, d: 0.5 }, { f: 220, d: 0.5 },
        { f: 196, d: 1 }, { f: 165, d: 0.5 }, { f: 147, d: 0.5 },
        { f: 131, d: 1 }, { f: 147, d: 1 }
      ],
      wave: 'sawtooth',
      bassNotes: [
        // Heavy marching bass
        { f: 73, d: 1 }, { f: 82, d: 0.5 }, { f: 98, d: 0.5 },
        { f: 110, d: 1 }, { f: 98, d: 1 },
        { f: 82, d: 0.5 }, { f: 73, d: 0.5 }, { f: 65, d: 1 },
        { f: 73, d: 1 }, { f: 73, d: 0.5 }, { f: 73, d: 0.5 },
        { f: 98, d: 1 }, { f: 110, d: 1 },
        { f: 147, d: 1 }, { f: 123, d: 0.5 }, { f: 110, d: 0.5 },
        { f: 98, d: 1 }, { f: 82, d: 0.5 }, { f: 73, d: 0.5 },
        { f: 65, d: 1 }, { f: 73, d: 1 }
      ],
      drums: [
        // Military march: boom-boom-crack
        { type: 'kick', d: 1 },
        { type: 'kick', d: 0.5 }, { type: 'hat', d: 0.5 },
        { type: 'snare', d: 1 },
        { type: 'hat', d: 0.5 }, { type: 'hat', d: 0.5 }
      ]
    }
  };

  let musicNodes = [];
  let musicInterval = null;

  // Drum synthesis helpers
  function playDrumHit(type, startTime) {
    if (!initialized) return;
    const now = startTime;

    switch (type) {
      case 'kick': {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(now);
        osc.stop(now + 0.15);
        // Click transient
        playMusicNoise(0.02, 0.06, now);
        break;
      }
      case 'snare': {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(now);
        osc.stop(now + 0.1);
        // Noise body
        playMusicNoise(0.1, 0.12, now);
        break;
      }
      case 'hat': {
        playMusicNoise(0.03, 0.04, now);
        break;
      }
    }
  }

  function playMusicNoise(duration, vol, startTime) {
    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    // High-pass for hats
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    noise.start(startTime);
  }

  function playMusic(vehicleType) {
    if (!initialized || !musicEnabled) return;
    stopMusic();
    resume();

    const theme = THEMES[vehicleType];
    if (!theme) return;

    const beatDuration = 60 / theme.tempo;
    let noteIndex = 0;
    let bassIndex = 0;
    let drumIndex = 0;
    let nextNoteTime = audioCtx.currentTime + 0.1;
    let nextBassTime = audioCtx.currentTime + 0.1;
    let nextDrumTime = audioCtx.currentTime + 0.1;

    function scheduleNote() {
      if (!musicEnabled) return;

      const now = audioCtx.currentTime;

      // Schedule melody notes
      while (nextNoteTime < now + 0.2) {
        const note = theme.notes[noteIndex % theme.notes.length];
        const dur = note.d * beatDuration;

        if (note.f > 0) {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = theme.wave;
          osc.frequency.value = note.f;
          gain.gain.setValueAtTime(0.10, nextNoteTime);
          gain.gain.setValueAtTime(0.10, nextNoteTime + dur * 0.6);
          gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + dur * 0.95);
          osc.connect(gain);
          gain.connect(musicGain);
          osc.start(nextNoteTime);
          osc.stop(nextNoteTime + dur);
        }

        nextNoteTime += dur;
        noteIndex++;
      }

      // Schedule bass notes
      while (nextBassTime < now + 0.2) {
        const note = theme.bassNotes[bassIndex % theme.bassNotes.length];
        const dur = note.d * beatDuration;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth'; // Gritty bass tone
        osc.frequency.value = note.f;
        gain.gain.setValueAtTime(0.10, nextBassTime);
        gain.gain.setValueAtTime(0.10, nextBassTime + dur * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, nextBassTime + dur);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextBassTime);
        osc.stop(nextBassTime + dur);

        nextBassTime += dur;
        bassIndex++;
      }

      // Schedule drum hits
      if (theme.drums) {
        while (nextDrumTime < now + 0.2) {
          const hit = theme.drums[drumIndex % theme.drums.length];
          const dur = hit.d * beatDuration;

          playDrumHit(hit.type, nextDrumTime);

          nextDrumTime += dur;
          drumIndex++;
        }
      }
    }

    musicInterval = setInterval(scheduleNote, 100);
    scheduleNote(); // Initial scheduling
    currentMusic = vehicleType;
  }

  function stopMusic() {
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
    currentMusic = null;
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (!musicEnabled) stopMusic();
    return musicEnabled;
  }

  function toggleSfx() {
    sfxEnabled = !sfxEnabled;
    return sfxEnabled;
  }

  function setVolume(v) {
    if (masterGain) masterGain.gain.value = clamp(v, 0, 1);
  }

  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  window.Game.Audio = {
    init, resume, play, playMusic, stopMusic,
    toggleMusic, toggleSfx, setVolume,
    get musicEnabled() { return musicEnabled; },
    get sfxEnabled() { return sfxEnabled; },
    get currentMusic() { return currentMusic; }
  };
})();
