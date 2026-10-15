/**
 * ==============================================================================
 * 🎷 Pixelmood Procedural Web Audio Engine (Self-Hosted Jazz & Ambience Generator)
 * ==============================================================================
 *
 * [개요 / Overview]
 * 외부 MP3/WAV 오디오 샘플이나 외부 서버 스트리밍 없이, 오직 브라우저 내장 Web Audio API만을
 * 활용하여 수학적 주파수 합성 및 결정론적 PRNG 알고리즘으로 실시간 무한 생성되는 재즈 사운드트랙 엔진입니다.
 *
 * [주요 특징 / Key Features]
 * 1. 0-Byte Audio Dependency: 외부 음원 파일 전무, 100% 자가 합성 (Pure Web Audio Synthesis)
 * 2. Deterministic Seed PRNG: Mulberry32 알고리즘을 통한 시드 기반의 재현 가능한 연주
 * 3. Jazz Turnaround & Harmony:
 *    - Classic 2-5-1 Loop (Dm9 -> G13 -> Cmaj9 -> A7)
 *    - Lush Altered Resolution (A7b9, b13 -> Dm9 반음 가이드 톤 해결)
 *    - Tritone Substitution (Dm9 -> Db7#11 -> Cmaj9 -> B7alt 반음 하강 베이스 라인)
 *    - Passing Diminished Ballad (Cmaj9 -> C#dim7 -> Dm9 -> G7b13)
 * 4. Realistic Physical Modeling Timbres:
 *    - Fender Rhodes EP: 금속 타현 틴(Tine, 4.25배음) 어택 + 은은한 트레몰로 바이브레이션
 *    - Acoustic Upright Wood Bass: 손가락 거트현 타격감 & 울림통 공명(180Hz 밴드패스 필터 엔벨로프)
 *    - Hollow-body Jazz Guitar & Vibes Chime
 * 5. Procedural Nature Ambience & Spatial Bus:
 *    - Brownian Noise: 고음이 부드럽게 감쇠된 빗소리 / LP 턴테이블 바닥 잡음
 *    - Vinyl Dust Ticks: 턴테이블 바늘에 닿는 미세 먼지 틱/팝(Click/Pop) 사운드
 *    - Spatial Reverb/Delay Bus: 320ms 딜레이 및 1600Hz 웜 댐핑 아날로그 룸 에코
 *
 * @author PoeticEcho & Antigravity
 * @license MIT
 */

(function (global) {
  'use strict';

  // ============================================================================
  // 1. 설정 및 상태 모델 (Configuration & Engine State)
  // ============================================================================

  const DEFAULT_CONFIG = {
    audioChannel: 'jazz',    // 'jazz' | 'lofi' | 'late_fm' | 'nocturne' | 'ambient'
    ambientLayer: 'random',  // 'random' | 'rain' | 'birds' | 'vinyl' | 'none'
    ambienceLevel: 5,        // 0 ~ 10
    volume: 0.22,            // 0.0 ~ 1.0
    seed: 2494034659,        // 기본 고정 시드 (BPM 72, Dm9 키톤)
    richAudio: true          // 풍부한 사운드 모드 (Altered 턴어라운드, Rhodes 틴 어택, 룸 에코)
  };

  class PixelmoodAudioEngine {
    constructor(userConfig = {}) {
      this.config = Object.assign({}, DEFAULT_CONFIG, userConfig);

      // Web Audio 노드 그래프 상태
      this.audioCtx = null;
      this.masterGain = null;
      this.noiseNode = null;
      this.noiseFilter = null;
      this.noiseGain = null;
      this.reverbDelay = null;
      this.reverbFeedback = null;
      this.reverbFilter = null;
      this.reverbGain = null;

      // 런타임 재생 상태
      this.isMusicPlaying = false;
      this.musicLoopTimer = null;
      this.prng = null;
      this.currentTrackMeta = { bpm: 72, keyName: 'Dm9', resolvedAmbience: 'rain', barMs: 4200, pitchFactor: 1.0 };
      this.chordStep = 0;

      // 이벤트 리스너 콜백 (UI 동기화용)
      this.onStateChange = null;
    }

    // ==========================================================================
    // 2. 결정론적 난수 생성기 (Mulberry32 PRNG)
    // ==========================================================================
    createSeededRandom(seed) {
      let a = seed >>> 0;
      return function () {
        let t = (a += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ==========================================================================
    // 3. 재즈 화성학 라이브러리 (Chord Progression Libraries)
    // ==========================================================================

    // [1] 클래식 모드: 심플하고 담백한 2-5-1 루프
    static CHORD_LIBRARIES = {
      'jazz': [
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [98.00, 196.00, 246.94, 293.66, 349.23, 493.88], // G13
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
          [110.00, 220.00, 277.18, 329.63, 392.00, 440.00]  // A7 (Simple Dominant)
        ]
      ],
      'lofi': [
        [
          [87.31, 174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
          [82.41, 164.81, 196.00, 246.94, 293.66, 392.00], // Em7
          [73.42, 146.83, 220.00, 261.63, 329.63, 349.23], // Dm9
          [65.41, 130.81, 196.00, 246.94, 329.63, 392.00]  // Cmaj9
        ]
      ],
      'late_fm': [
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [98.00, 196.00, 246.94, 293.66, 349.23, 440.00], // G13
          [65.41, 130.81, 196.00, 246.94, 293.66, 329.63], // Cmaj9
          [110.00, 220.00, 261.63, 329.63, 392.00, 493.88] // Am9
        ]
      ],
      'nocturne': [
        [
          [110.00, 220.00, 261.63, 329.63, 440.00, 523.25], // Am9
          [73.42, 146.83, 220.00, 293.66, 349.23, 587.33],  // Dm11
          [98.00, 196.00, 246.94, 293.66, 392.00, 493.88],  // G7
          [65.41, 130.81, 196.00, 246.94, 329.63, 523.25]   // Cmaj9
        ]
      ],
      'ambient': [
        [
          [65.41, 130.81, 196.00, 293.66, 392.00],
          [87.31, 174.61, 261.63, 329.63, 440.00],
          [73.42, 146.83, 220.00, 293.66, 392.00]
        ]
      ]
    };

    // [2] [풍부하게] 모드: Altered Dominant, 트라이톤 대리코드 하강, 패싱 디미니쉬
    static CHORD_LIBRARIES_LUSH = {
      'jazz': [
        // 1-1. 빌 에반스 스타일 2-5-1-6 with A7(b9, b13) 강력한 반음 해결
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9: D2, D3, A3, C4, E4, A4
          [98.00, 196.00, 246.94, 293.66, 349.23, 440.00], // G13: G2, G3, B3, D4, F4, A4
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9: C2, C3, G3, B3, D4, G4
          [110.00, 220.00, 277.18, 349.23, 392.00, 466.16]  // A7(b9, b13): A2, A3, C#4, F4, G4, Bb4 -> 다음 Dm9으로 완벽한 반음 해결!
        ],
        // 1-2. 트라이톤 대리코드 반음 하강 진행 (D -> Db -> C -> B)
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [69.30, 138.59, 174.61, 246.94, 277.18, 369.99], // Db7(#11): Db2, Db3, F3, B3, Db4, G4(#11)
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
          [61.74, 123.47, 185.00, 246.94, 311.13, 392.00]  // B7(alt): B1, B2, F#3, B3, D#4, G4(b13)
        ],
        // 1-3. 서정적 패싱 디미니쉬 발라드 진행 (Cmaj9 -> C#dim7 -> Dm9 -> G7b13)
        [
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
          [69.30, 138.59, 174.61, 233.08, 277.18, 329.63], // C#dim7: C#2, C#3, F3, Bb3, C#4, E4
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [98.00, 196.00, 246.94, 311.13, 349.23, 440.00]  // G7(b13): G2, G3, B3, Eb4, F4, A4
        ]
      ],
      'lofi': [
        [
          [87.31, 174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
          [82.41, 164.81, 196.00, 246.94, 293.66, 392.00], // Em7
          [73.42, 146.83, 220.00, 261.63, 329.63, 349.23], // Dm9
          [65.41, 130.81, 196.00, 246.94, 329.63, 392.00]  // Cmaj9
        ],
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [98.00, 196.00, 261.63, 293.66, 349.23, 440.00], // G13sus4
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
          [110.00, 220.00, 261.63, 329.63, 392.00, 440.00] // Am9
        ]
      ],
      'late_fm': [
        [
          [73.42, 146.83, 220.00, 261.63, 329.63, 440.00], // Dm9
          [98.00, 196.00, 246.94, 311.13, 349.23, 440.00], // G13(b9)
          [65.41, 130.81, 196.00, 246.94, 293.66, 392.00], // Cmaj9
          [110.00, 220.00, 277.18, 349.23, 392.00, 466.16] // A7(b13)
        ]
      ],
      'nocturne': [
        [
          [110.00, 220.00, 261.63, 329.63, 440.00, 523.25], // Am9
          [73.42, 146.83, 220.00, 293.66, 349.23, 587.33],  // Dm11
          [98.00, 196.00, 246.94, 311.13, 349.23, 493.88],  // G7(b9)
          [65.41, 130.81, 196.00, 246.94, 329.63, 523.25]   // Cmaj9(add13)
        ]
      ],
      'ambient': [
        [
          [65.41, 130.81, 196.00, 293.66, 392.00],
          [87.31, 174.61, 261.63, 329.63, 440.00],
          [73.42, 146.83, 220.00, 293.66, 392.00]
        ]
      ]
    };

    // ==========================================================================
    // 4. 오디오 그래프 초기화 및 공간감 에코 버스 (Web Audio Graph Setup)
    // ==========================================================================
    initAudioEngine() {
      if (this.audioCtx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // 마스터 게인 노드 (볼륨 컨트롤 & 팝 노이즈 방지)
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);

      // 공간감 아날로그 에코/리버브 버스 생성 (Stereo/Room Delay with Warm Damping)
      try {
        this.reverbDelay = this.audioCtx.createDelay(1.0);
        this.reverbDelay.delayTime.setValueAtTime(0.32, this.audioCtx.currentTime);

        this.reverbFeedback = this.audioCtx.createGain();
        this.reverbFeedback.gain.setValueAtTime(0.24, this.audioCtx.currentTime);

        this.reverbFilter = this.audioCtx.createBiquadFilter();
        this.reverbFilter.type = 'lowpass';
        this.reverbFilter.frequency.setValueAtTime(1600, this.audioCtx.currentTime);

        this.reverbGain = this.audioCtx.createGain();
        this.reverbGain.gain.setValueAtTime(this.config.richAudio ? 0.16 : 0.0, this.audioCtx.currentTime);

        // 루프: Delay -> Filter -> Feedback -> Delay
        this.reverbDelay.connect(this.reverbFilter);
        this.reverbFilter.connect(this.reverbFeedback);
        this.reverbFeedback.connect(this.reverbDelay);

        // 출력: Filter -> ReverbGain -> MasterGain
        this.reverbFilter.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);
      } catch (e) {
        console.warn('Spatial reverb setup failed:', e);
      }

      this.setupAmbientNoiseLayer();
    }

    // ==========================================================================
    // 5. 브라우니안 빗소리 노이즈 레이어 (Brownian Rain & Vinyl Noise)
    // ==========================================================================
    setupAmbientNoiseLayer() {
      if (!this.audioCtx) return;
      if (this.noiseNode) {
        try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch (e) {}
      }
      const bufferSize = this.audioCtx.sampleRate * 3;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.025 * white)) / 1.025; // 1차 저역 통과 적분
        lastOut = data[i];
        data[i] *= 0.45;
      }

      this.noiseNode = this.audioCtx.createBufferSource();
      this.noiseNode.buffer = buffer;
      this.noiseNode.loop = true;

      this.noiseFilter = this.audioCtx.createBiquadFilter();
      this.noiseFilter.type = 'lowpass';
      this.noiseFilter.frequency.value = 920;

      this.noiseGain = this.audioCtx.createGain();
      this.noiseGain.gain.value = this.getTargetNoiseGain();

      this.noiseNode.connect(this.noiseFilter);
      this.noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.masterGain);
      this.noiseNode.start();
    }

    getTargetNoiseGain() {
      if (this.config.ambientLayer === 'none' || this.config.ambienceLevel === 0) return 0.0;
      const levelScale = this.config.ambienceLevel / 5.0;
      const activeAmb = this.config.ambientLayer === 'random' ? this.currentTrackMeta.resolvedAmbience : this.config.ambientLayer;
      if (activeAmb === 'rain') return 0.13 * levelScale;
      if (activeAmb === 'birds') return 0.055 * levelScale;
      return 0.065 * levelScale;
    }

    // ==========================================================================
    // 6. 턴테이블 LP 바이닐 먼지 틱 노이즈 (Vinyl Dust Click / Pop)
    // ==========================================================================
    playVinylDustTick(time) {
      if (!this.audioCtx || !this.isMusicPlaying || !this.config.richAudio) return;
      try {
        const tickOsc = this.audioCtx.createOscillator();
        const tickGain = this.audioCtx.createGain();
        const tickFilter = this.audioCtx.createBiquadFilter();

        tickOsc.type = 'triangle';
        tickOsc.frequency.setValueAtTime(2600 + Math.random() * 2000, time);

        tickFilter.type = 'highpass';
        tickFilter.frequency.setValueAtTime(1800, time);

        tickGain.gain.setValueAtTime(0.0001, time);
        tickGain.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.016, time + 0.002);
        tickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);

        tickOsc.connect(tickFilter);
        tickFilter.connect(tickGain);
        tickGain.connect(this.masterGain);

        tickOsc.start(time);
        tickOsc.stop(time + 0.015);
      } catch (e) {}
    }

    // ==========================================================================
    // 7. 악기 음색 물리 모델링 합성 (Instrument Physical Modeling Synthesis)
    // ==========================================================================
    playInstrumentNote(freq, startTime, duration, inst = 'rhodes', velocity = 0.12) {
      if (!this.audioCtx || !this.isMusicPlaying) return;
      const osc = this.audioCtx.createOscillator();
      const subOsc = this.audioCtx.createOscillator();
      const noteGain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      let tineOsc = null;
      let tineGain = null;

      if (inst === 'bass') {
        // 어쿠스틱 콘트라베이스 (Woody Upright Bass)
        osc.type = 'triangle';
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(freq, startTime);
        filter.type = 'lowpass';

        if (this.config.richAudio) {
          // 손가락 거트현 타격감(Woody Pluck) & 바디 공명
          filter.Q.setValueAtTime(1.8, startTime);
          filter.frequency.setValueAtTime(520, startTime);
          filter.frequency.exponentialRampToValueAtTime(190, startTime + 0.12);
        } else {
          filter.frequency.setValueAtTime(340, startTime);
        }
      } else if (inst === 'jazz_guitar') {
        // 풀할로우 바디 재즈 기타 (Gibson ES-175 넥 픽업 톤)
        osc.type = 'triangle';
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(freq * 2, startTime);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.config.richAudio ? 980 : 1250, startTime);
      } else if (inst === 'vibes') {
        // 맑고 공명하는 벨 / 비브라폰
        osc.type = 'sine';
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(freq * 3, startTime);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200, startTime);
      } else {
        // 일렉트릭 피아노 (Fender Rhodes Mark I)
        osc.type = 'sine';
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(freq * 2, startTime);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(this.config.richAudio ? 1200 : 1020, startTime);

        if (this.config.richAudio) {
          // 빈티지 Rhodes 특유의 맑은 Tine(금속 타현 4.25배음) 어택
          try {
            tineOsc = this.audioCtx.createOscillator();
            tineGain = this.audioCtx.createGain();
            tineOsc.type = 'sine';
            tineOsc.frequency.setValueAtTime(freq * 4.25, startTime);
            tineGain.gain.setValueAtTime(velocity * 0.24, startTime);
            tineGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
            tineOsc.connect(tineGain);
            tineGain.connect(this.masterGain);
            if (this.reverbDelay) tineGain.connect(this.reverbDelay);
            tineOsc.start(startTime);
            tineOsc.stop(startTime + 0.06);
          } catch (e) {}
        }
      }

      osc.frequency.setValueAtTime(freq, startTime);
      const subGain = this.audioCtx.createGain();
      subGain.gain.setValueAtTime(velocity * (this.config.richAudio && inst === 'rhodes' ? 0.22 : 0.16), startTime);

      const attack = inst === 'bass' ? 0.05 : (this.config.richAudio ? 0.07 : 0.14);
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(velocity, startTime + attack);

      // Tremolo 효과 (풍부하게 모드일 때 은은한 감성 비브라토/트레몰로 감쇠)
      if (this.config.richAudio && inst === 'rhodes' && duration > 0.8) {
        noteGain.gain.setTargetAtTime(velocity * 0.68, startTime + attack + 0.12, 0.22);
      }
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(filter);
      subOsc.connect(subGain);
      subGain.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.masterGain);

      // 리버브 버스로 공간감 여운 전달
      if (this.reverbDelay && this.config.richAudio && inst !== 'bass') {
        noteGain.connect(this.reverbDelay);
      }

      osc.start(startTime);
      subOsc.start(startTime);
      osc.stop(startTime + duration + 0.05);
      subOsc.stop(startTime + duration + 0.05);
    }

    // ==========================================================================
    // 8. 브러시 퍼커션 & 자연 앰비언스 (Brush Percussion & Nature Ambience)
    // ==========================================================================
    playBrushPercussion(startTime, barDurSec) {
      if (!this.audioCtx || !this.isMusicPlaying || this.config.audioChannel === 'ambient' || this.config.audioChannel === 'nocturne') return;
      const beatSec = barDurSec / 4;
      [0, 2].forEach(b => {
        const t = startTime + b * beatSec;
        const osc = this.audioCtx.createOscillator();
        const g = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.16); // 피치 하강 드롭 베이스 킥
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    }

    maybePlayNatureAmbience(now) {
      const activeAmb = this.config.ambientLayer === 'random' ? this.currentTrackMeta.resolvedAmbience : this.config.ambientLayer;
      if (activeAmb === 'none' || this.config.ambienceLevel === 0) return;
      const levelScale = this.config.ambienceLevel / 5.0;
      const r = this.prng ? this.prng() : Math.random();

      // 풍부하게 모드일 때: LP 바이닐 미세 먼지 틱 노이즈 발생
      if (this.config.richAudio && (activeAmb === 'vinyl' || activeAmb === 'random' || activeAmb === 'rain')) {
        const popCount = 1 + Math.floor(Math.random() * 3);
        for (let p = 0; p < popCount; p++) {
          this.playVinylDustTick(now + 0.4 + Math.random() * 3.2);
        }
      }

      if (activeAmb === 'birds' && r < 0.55) {
        const baseBird = 1400 + (this.prng ? this.prng() : Math.random()) * 520;
        this.playInstrumentNote(baseBird, now + 1.4, 0.28, 'vibes', 0.016 * levelScale);
        this.playInstrumentNote(baseBird * 1.19, now + 1.68, 0.38, 'vibes', 0.014 * levelScale);
      } else if (activeAmb === 'rain' && r < 0.4) {
        const dropFreq = 980 + (this.prng ? this.prng() : Math.random()) * 600;
        this.playInstrumentNote(dropFreq, now + 2.1, 0.22, 'vibes', 0.01 * levelScale);
      }
    }

    // ==========================================================================
    // 9. 제너레이티브 마디 스케줄러 (Generative Bar Scheduler)
    // ==========================================================================
    scheduleGenerativeBar() {
      if (!this.isMusicPlaying || !this.audioCtx) return;
      if (!this.prng) this.initializeSeedTrack(this.config.seed);

      const libGroup = (this.config.richAudio && PixelmoodAudioEngine.CHORD_LIBRARIES_LUSH[this.config.audioChannel])
        ? PixelmoodAudioEngine.CHORD_LIBRARIES_LUSH[this.config.audioChannel]
        : (PixelmoodAudioEngine.CHORD_LIBRARIES[this.config.audioChannel] || PixelmoodAudioEngine.CHORD_LIBRARIES['jazz']);

      // 풍부하게 모드에서는 4마디마다 다채로운 진행 풀(Progression Pool) 순환
      const progIndex = this.config.richAudio
        ? (Math.floor(this.chordStep / 4) + this.config.seed) % libGroup.length
        : (this.config.seed % libGroup.length);
      const prog = libGroup[progIndex];
      const rawChord = prog[this.chordStep % prog.length];
      const chord = rawChord.map(f => f * (this.currentTrackMeta.pitchFactor || 1.0));
      this.chordStep++;

      const now = this.audioCtx.currentTime;
      const barDurSec = this.currentTrackMeta.barMs / 1000;
      const isJazz = this.config.audioChannel === 'jazz' || this.config.audioChannel === 'late_fm';

      // 베이스 연주 (루트 및 재즈 워킹 5도음)
      this.playInstrumentNote(chord[0], now, barDurSec * 0.55, 'bass', 0.14);
      if (isJazz && chord.length > 2) {
        this.playInstrumentNote(chord[0] * 1.5, now + barDurSec * 0.5, barDurSec * 0.45, 'bass', 0.11);
      }

      // 화음 컴핑 (탑 노트 멜로디 강조 및 스윙 아르페지오)
      const chordInst = this.config.audioChannel === 'nocturne' ? 'vibes' : 'rhodes';
      chord.slice(1).forEach((freq, idx) => {
        const swingDelay = isJazz ? (idx * 0.14 + (idx % 2 === 1 ? 0.04 : 0.0)) : (idx * 0.12);
        const isTopNote = idx === chord.length - 2;
        const vel = this.config.richAudio ? (isTopNote ? 0.088 : 0.065) : 0.075;
        this.playInstrumentNote(freq, now + swingDelay, barDurSec * 0.92, chordInst, vel);
      });

      // 솔로 선율 (재즈 기타 / 비브라폰 아르페지에이티드 차임)
      const soloCount = this.config.audioChannel === 'ambient' ? 1 : 3;
      const soloInst = isJazz ? 'jazz_guitar' : 'vibes';
      for (let m = 0; m < soloCount; m++) {
        const rIdx = 1 + Math.floor(this.prng() * (chord.length - 1));
        const pickFreq = chord[rIdx] * ((this.prng() > 0.45) ? 2.0 : 1.5);
        const noteOffset = (0.95 + m * 1.12 + this.prng() * 0.22);
        this.playInstrumentNote(pickFreq, now + noteOffset, 2.3, soloInst, 0.068);
      }

      this.playBrushPercussion(now, barDurSec);
      this.maybePlayNatureAmbience(now);

      this.musicLoopTimer = setTimeout(() => this.scheduleGenerativeBar(), this.currentTrackMeta.barMs);
    }

    // ==========================================================================
    // 10. 재생 제어 및 외부 인터페이스 (Playback Control & Public API)
    // ==========================================================================
    initializeSeedTrack(seedVal) {
      this.config.seed = seedVal >>> 0;
      this.prng = this.createSeededRandom(this.config.seed);
      this.chordStep = 0;

      const bpmBase = this.config.audioChannel === 'ambient' ? 56 : 68;
      this.currentTrackMeta.bpm = bpmBase + Math.floor(this.prng() * 14);
      this.currentTrackMeta.barMs = Math.round((60 / this.currentTrackMeta.bpm) * 4 * 1000);
      const semitoneShift = Math.floor(this.prng() * 5) - 2;
      this.currentTrackMeta.pitchFactor = Math.pow(2, semitoneShift / 12);

      if (this.config.ambientLayer === 'random') {
        const ambChoices = ['rain', 'birds', 'vinyl'];
        this.currentTrackMeta.resolvedAmbience = ambChoices[Math.floor(this.prng() * ambChoices.length)];
      } else {
        this.currentTrackMeta.resolvedAmbience = this.config.ambientLayer;
      }

      if (this.noiseGain && this.audioCtx) {
        this.noiseGain.gain.setTargetAtTime(this.getTargetNoiseGain(), this.audioCtx.currentTime, 0.4);
      }

      this._emitChange();
    }

    setMusicState(turnOn) {
      this.initAudioEngine();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.isMusicPlaying = turnOn;

      if (this.isMusicPlaying) {
        if (this.noiseGain && this.audioCtx) {
          this.noiseGain.gain.setTargetAtTime(this.getTargetNoiseGain(), this.audioCtx.currentTime, 0.5);
        }
        if (this.reverbGain && this.audioCtx) {
          this.reverbGain.gain.setTargetAtTime(this.config.richAudio ? 0.16 : 0.0, this.audioCtx.currentTime, 0.5);
        }
        if (this.masterGain && this.audioCtx) {
          this.masterGain.gain.setTargetAtTime(this.config.volume, this.audioCtx.currentTime, 0.8);
        }
        if (this.musicLoopTimer) clearTimeout(this.musicLoopTimer);
        this.scheduleGenerativeBar();
      } else {
        if (this.masterGain && this.audioCtx) {
          this.masterGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.4);
        }
        if (this.reverbGain && this.audioCtx) {
          this.reverbGain.gain.setTargetAtTime(0.0001, this.audioCtx.currentTime, 0.4);
        }
        if (this.musicLoopTimer) {
          clearTimeout(this.musicLoopTimer);
          this.musicLoopTimer = null;
        }
      }

      this._emitChange();
    }

    toggleMusic() {
      this.setMusicState(!this.isMusicPlaying);
    }

    toggleRichAudio(turnOn) {
      this.config.richAudio = turnOn;
      if (this.reverbGain && this.audioCtx) {
        this.reverbGain.gain.setTargetAtTime(this.config.richAudio ? 0.16 : 0.0, this.audioCtx.currentTime, 0.25);
      }
      this._emitChange();
    }

    updateVolume(val) {
      this.config.volume = parseFloat(val);
      if (this.masterGain && this.audioCtx && this.isMusicPlaying) {
        this.masterGain.gain.setTargetAtTime(this.config.volume, this.audioCtx.currentTime, 0.2);
      }
      this._emitChange();
    }

    updateAmbienceLevel(val) {
      this.config.ambienceLevel = parseInt(val, 10);
      if (this.noiseGain && this.audioCtx && this.isMusicPlaying) {
        this.noiseGain.gain.setTargetAtTime(this.getTargetNoiseGain(), this.audioCtx.currentTime, 0.3);
      }
      this._emitChange();
    }

    changeAudioChannel(ch) {
      this.config.audioChannel = ch;
      this.initializeSeedTrack(this.config.seed);
      if (!this.isMusicPlaying) this.setMusicState(true);
    }

    changeAmbientLayer(layer) {
      this.config.ambientLayer = layer;
      this.initializeSeedTrack(this.config.seed);
    }

    nextRandomSeed() {
      const nextSeed = Math.floor(1000000000 + Math.random() * 3000000000);
      this.initializeSeedTrack(nextSeed);
      if (!this.isMusicPlaying) this.setMusicState(true);
      return nextSeed;
    }

    resetDefaultSeed() {
      this.initializeSeedTrack(2494034659);
    }

    _emitChange() {
      if (typeof this.onStateChange === 'function') {
        this.onStateChange({
          isPlaying: this.isMusicPlaying,
          config: Object.assign({}, this.config),
          meta: Object.assign({}, this.currentTrackMeta)
        });
      }
    }
  }

  // 글로벌 등록 및 모듈 내보내기 (Browser Window or Node/ES Module)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelmoodAudioEngine;
  } else {
    global.PixelmoodAudioEngine = PixelmoodAudioEngine;
  }

})(typeof window !== 'undefined' ? window : this);
