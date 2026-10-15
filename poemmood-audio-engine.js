/**
 * Peommood Audio Engine 2.1.0 — procedural jazz for reading.
 * No samples, network requests, dependencies or build step. MIT License.
 * Refactored from Pixelmood (PoeticEcho & Antigravity, MIT).
 *
 * Browser: new PeommoodAudioEngine(); await engine.start() in a user gesture.
 * CommonJS: const Engine = require('./peommood-audio-engine.js');
 * Pure composition: new Engine.Composer(config).nextBar().
 * Audio synthesis is stylized additive/subtractive synthesis, not a physical model.
 */
(function (root, factory) {
  'use strict';
  const Engine = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Engine;
  else {
    root.PeommoodAudioEngine = Engine;
    root.PoemmoodAudioEngine = Engine; // Earlier project spelling.
    // Compatibility for existing Pixelmood integrations.
    if (!root.PixelmoodAudioEngine) root.PixelmoodAudioEngine = Engine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const VERSION = '2.1.0';
  const DEFAULT_SEED = 2494034659;
  const TAU = Math.PI * 2;
  const EPS = 0.00001;
  const CHANNELS = ['jazz', 'lofi', 'late_fm', 'nocturne', 'ambient'];
  const AMBIENCES = ['random', 'rain', 'birds', 'vinyl', 'none'];
  const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const DEFAULTS = Object.freeze({
    seed: DEFAULT_SEED, audioChannel: 'jazz', ambientLayer: 'rain',
    ambienceLevel: 2, volume: 0.32, richAudio: true,
    themeMinSeconds: 120, themeMaxSeconds: 240, maxVoices: 48,
    lookAheadSeconds: 0.20, schedulerIntervalMs: 25,
    warmth: 0.68, space: 0.48, density: 0.42, tension: 0.35
  });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (v, fallback, a, b) => clamp(Number.isFinite(Number(v)) ? Number(v) : fallback, a, b);
  const pc = n => ((n % 12) + 12) % 12;
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  function hash(seed, salt) {
    let x = (seed ^ Math.imul((salt + 1) >>> 0, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function settings(input = {}) {
    const c = { ...DEFAULTS, ...input };
    c.seed = num(c.seed, DEFAULT_SEED, 0, 0xffffffff) >>> 0;
    if (!CHANNELS.includes(c.audioChannel)) c.audioChannel = 'jazz';
    if (!AMBIENCES.includes(c.ambientLayer)) c.ambientLayer = 'rain';
    c.volume = num(c.volume, DEFAULTS.volume, 0, 1);
    c.ambienceLevel = num(c.ambienceLevel, 2, 0, 10);
    c.richAudio = Boolean(c.richAudio);
    c.themeMinSeconds = num(c.themeMinSeconds, 120, 60, 540);
    c.themeMaxSeconds = num(c.themeMaxSeconds, 240, c.themeMinSeconds + 20, 600);
    c.maxVoices = Math.round(num(c.maxVoices, 48, 16, 128));
    c.lookAheadSeconds = num(c.lookAheadSeconds, .20, .08, .5);
    c.schedulerIntervalMs = num(c.schedulerIntervalMs, 25, 10, 50);
    for (const k of ['warmth', 'space', 'density', 'tension']) c[k] = num(c[k], DEFAULTS[k], 0, 1);
    return c;
  }

  // chord tones, followed by four essential upper-voice intervals.
  // Major/minor thirds, sevenths and named extensions are explicit.
  const QUALITIES = Object.freeze({
    maj9: { tones: [0, 4, 7, 11, 14], upper: [4, 7, 11, 14] },
    '6/9': { tones: [0, 4, 7, 9, 14], upper: [4, 7, 9, 14] },
    m9: { tones: [0, 3, 7, 10, 14], upper: [3, 7, 10, 14] },
    m11: { tones: [0, 3, 7, 10, 14, 17], upper: [3, 10, 14, 17] },
    'm6/9': { tones: [0, 3, 7, 9, 14], upper: [3, 7, 9, 14] },
    '13': { tones: [0, 4, 7, 10, 14, 21], upper: [4, 10, 14, 21] },
    '13sus4': { tones: [0, 5, 7, 10, 14, 21], upper: [5, 10, 14, 21] },
    '7(♭9,♭13)': { tones: [0, 4, 10, 13, 20], upper: [4, 10, 13, 20] },
    '7(♯11)': { tones: [0, 4, 7, 10, 14, 18], upper: [4, 10, 14, 18] },
    dim7: { tones: [0, 3, 6, 9], upper: [0, 3, 6, 9] },
    m7b5: { tones: [0, 3, 6, 10, 17], upper: [3, 6, 10, 17] }
  });
  // All themes begin on their tonic. The last bar is explicitly resolved.
  const PROGRESSIONS = {
    letter: [[0,'maj9'],[9,'m9'],[2,'m9'],[7,'13'],[0,'6/9'],[5,'maj9'],[7,'13sus4'],[0,'maj9']],
    cafe: [[0,'maj9'],[9,'7(♭9,♭13)'],[2,'m9'],[7,'13'],[4,'m9'],[9,'m9'],[2,'m9'],[7,'13']],
    falling: [[0,'maj9'],[0,'6/9'],[2,'m9'],[1,'7(♯11)'],[0,'maj9'],[8,'maj9'],[5,'m9'],[0,'6/9']],
    candle: [[0,'6/9'],[1,'dim7'],[2,'m9'],[7,'13'],[0,'maj9'],[5,'maj9'],[5,'m9'],[0,'6/9']],
    blue: [[0,'m9'],[5,'m9'],[2,'m7b5'],[7,'7(♭9,♭13)'],[0,'m6/9'],[8,'maj9'],[2,'m7b5'],[7,'7(♭9,♭13)']],
    moon: [[0,'m9'],[3,'maj9'],[8,'maj9'],[7,'7(♭9,♭13)'],[0,'m9'],[5,'m11'],[7,'7(♭9,♭13)'],[0,'m6/9']],
    window: [[0,'m9'],[5,'13'],[0,'m11'],[0,'m6/9'],[10,'maj9'],[5,'13sus4'],[0,'m11'],[0,'m9']],
    water: [[0,'maj9'],[0,'6/9'],[5,'maj9'],[5,'maj9'],[0,'maj9'],[9,'m9'],[7,'13sus4'],[0,'6/9']]
  };
  const PROFILES = [
    { id:'letter', name:'종이 위의 햇살', mode:'major', lead:'jazz_guitar' },
    { id:'cafe', name:'오래된 찻잔', mode:'major', lead:'rhodes' },
    { id:'falling', name:'비가 지나간 자리', mode:'major', lead:'jazz_guitar' },
    { id:'candle', name:'촛불의 문장', mode:'major', lead:'vibes' },
    { id:'blue', name:'푸른 저녁', mode:'minor', lead:'rhodes' },
    { id:'moon', name:'달빛의 여백', mode:'minor', lead:'vibes' },
    { id:'window', name:'열린 창가', mode:'dorian', lead:'jazz_guitar' },
    { id:'water', name:'고요한 물결', mode:'major', lead:'vibes' }
  ];
  const SCALES = { major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10], dorian:[0,2,3,5,7,9,10] };
  const RHYTHMS = [[.5,1.5,3],[0,1.5,2.5],[.5,2,3.5],[0,2.5],[1,2,3],[.5,2.5]];
  const LEADS = ['rhodes','jazz_guitar','vibes'];
  const CODE_KEYS = ['seed','audioChannel','ambientLayer','ambienceLevel','volume','richAudio',
    'themeMinSeconds','themeMaxSeconds','warmth','space','density','tension',
    'maxVoices','lookAheadSeconds','schedulerIntervalMs'];
  const clone = value => JSON.parse(JSON.stringify(value));
  let randomNonce = 0;
  function randomSeed() {
    const a = new Uint32Array(1);
    if (root.crypto?.getRandomValues) root.crypto.getRandomValues(a);
    else a[0] = hash(Date.now() >>> 0, ++randomNonce + Math.floor((root.performance?.now() || 0)*1000));
    return a[0];
  }
  function checksum(s) {
    let h=0x811c9dc5;
    for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),0x01000193);
    return (h>>>0).toString(16).padStart(8,'0');
  }
  // PM1 is a versioned composition recipe, not a secret or an audio recording.
  // Numeric arrays keep the payload ASCII and portable without dependencies.
  function encodeCode(config, snapshot) {
    let s=null;
    if(snapshot){
      const t=snapshot.theme;
      s=[[t.index,PROFILES.findIndex(p=>p.id===t.profileId),t.key,t.bpm,t.bars,t.motif,
        t.rhythmIndex,t.home,LEADS.indexOf(t.lead),t.pan,t.swing,AMBIENCES.indexOf(t.resolvedAmbience)],
        [snapshot.globalBar,snapshot.elapsedSeconds,snapshot.previousVoicing,snapshot.previousMelody,snapshot.previousBass]];
    }
    const raw=JSON.stringify([CODE_KEYS.map(k=>config[k]),s]);
    const body=(typeof root.btoa==='function'?root.btoa(raw):Buffer.from(raw,'ascii').toString('base64'))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return 'PM1.'+body+'.'+checksum(body);
  }
  function decodeCode(code) {
    const fail=()=>{throw new RangeError('재현 코드가 손상되었거나 지원하지 않는 형식입니다.');};
    if(typeof code!=='string'||code.length>4096) return fail();
    const parts=code.trim().split('.');
    if(parts.length!==3||parts[0]!=='PM1'||!/^[-_A-Za-z0-9]+$/.test(parts[1])||checksum(parts[1])!==parts[2])return fail();
    let payload;
    try{
      const b=parts[1].replace(/-/g,'+').replace(/_/g,'/');
      payload=JSON.parse(typeof root.atob==='function'?root.atob(b):Buffer.from(b,'base64').toString('ascii'));
    }catch(_){return fail();}
    const range=(n,lo,hi,integer=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi&&(!integer||Number.isInteger(n));
    if(!Array.isArray(payload)||payload.length!==2||!Array.isArray(payload[0])||payload[0].length!==CODE_KEYS.length)return fail();
    const config=Object.fromEntries(CODE_KEYS.map((k,i)=>[k,payload[0][i]]));
    const normalized=settings(config);
    if(CODE_KEYS.some(k=>config[k]!==normalized[k])||!range(config.seed,0,0xffffffff,true))return fail();
    let snapshot=null;
    if(payload[1]!==null){
      const s=payload[1];
      if(!Array.isArray(s)||s.length!==2||!Array.isArray(s[0])||s[0].length!==12||!Array.isArray(s[1])||s[1].length!==5)return fail();
      const [t,state]=s;
      if(!range(t[0],0,1e9,true)||!range(t[1],0,PROFILES.length-1,true)||!range(t[2],0,11,true)||
        !range(t[3],56,78,true)||!range(t[4],4,200,true)||t[4]%4||
        !Array.isArray(t[5])||t[5].length!==8||t[5].some(n=>!range(n,-6,8,true))||
        !range(t[6],0,RHYTHMS.length-1,true)||!range(t[7],7,9,true)||!range(t[8],0,2,true)||
        !range(t[9],-.14,.14)||!range(t[10],0,.2)||!range(t[11],1,4,true)||
        !range(state[0],0,1e12,true)||!range(state[1],0,1e12)||
        !(state[2]===null||(Array.isArray(state[2])&&state[2].length===4&&state[2].every(n=>range(n,48,76,true))))||
        !(state[3]===null||range(state[3],64,83,true))||!range(state[4],24,60,true))return fail();
      const p=PROFILES[t[1]],barSeconds=240/t[3];
      snapshot={theme:{index:t[0],profileId:p.id,name:p.name,mode:p.mode,key:t[2],
        keyName:NAMES[t[2]]+(p.mode==='major'?' major':p.mode==='minor'?' minor':' dorian'),
        bpm:t[3],barSeconds,bars:t[4],durationSeconds:t[4]*barSeconds,motif:t[5],rhythmIndex:t[6],
        home:t[7],lead:LEADS[t[8]],pan:t[9],swing:t[10],resolvedAmbience:AMBIENCES[t[11]]},
        globalBar:state[0],elapsedSeconds:state[1],previousVoicing:state[2],previousMelody:state[3],previousBass:state[4]};
    }
    return {config,snapshot};
  }
  function recipe(input) {
    if(typeof input==='string'){
      const value=input.trim();
      if(value.startsWith('PM'))return decodeCode(value);
      if(value==='')return {config:settings({seed:randomSeed()}),snapshot:null};
      if(!/^\d{1,10}$/.test(value)||Number(value)>0xffffffff)throw new RangeError('숫자 시드 또는 PM1 재현 코드를 입력하세요.');
      input={seed:Number(value)};
    }else if(typeof input==='number')input={seed:input};
    if(input&&Object.prototype.hasOwnProperty.call(input,'code'))return recipe(input.code==null?'':input.code);
    const c={...(input||{})};
    if(c.seed==null||c.seed==='')c.seed=randomSeed();
    return {config:settings(c),snapshot:null};
  }
  const VOICING_CACHE = new Map(); // At most 12 × quality-count entries.
  function candidates(rootPc, quality) {
    const key = rootPc + ':' + quality;
    if (VOICING_CACHE.has(key)) return VOICING_CACHE.get(key);
    const tones = QUALITIES[quality].upper.map(n => pc(rootPc + n));
    const result = [], seen = new Set();
    function visit(i, notes) {
      if (i < tones.length) {
        for (let n = 48 + tones[i]; n <= 76; n += 12) visit(i + 1, notes.concat(n));
        return;
      }
      const v = notes.slice().sort((a,b) => a-b);
      if (v[3]-v[0] > 21 || v.some((n,j) => j && n-v[j-1] < (n < 55 ? 3 : 1))) return;
      const id = v.join(',');
      if (!seen.has(id)) { seen.add(id); result.push(v); }
    }
    visit(0, []);
    VOICING_CACHE.set(key, result);
    return result;
  }
  function voiceLead(rootPc, quality, previous) {
    let best, score = Infinity;
    for (const v of candidates(rootPc, quality)) {
      let cost = Math.abs(v.reduce((a,b)=>a+b,0)/4 - 61) * .35;
      if (previous) for (let j=0;j<4;j++) {
        const d = Math.abs(v[j]-previous[j]);
        cost += d + Math.max(0,d-4)*1.7;
      }
      cost += Math.max(0,v[3]-v[0]-16)*.3;
      if (cost < score) { score=cost; best=v; }
    }
    if (!best) throw new Error('No voicing for ' + quality);
    return best.slice();
  }
  function nearPitch(target, allowed, previous, lo=64, hi=83) {
    let best=lo, cost=Infinity;
    for (let n=lo;n<=hi;n++) {
      if (!allowed.includes(pc(n))) continue;
      const movement = previous == null ? 0 : Math.abs(n-previous);
      const c = Math.abs(n-target) + movement*.24 + Math.max(0,movement-5)*1.4;
      if (c < cost) { best=n; cost=c; }
    }
    return best;
  }

  /** Pure, bounded-state score generator; does not access Web Audio or timers. */
  class Composer {
    constructor(config = {}) {
      this.config = settings(config);
      this.theme = this._makeTheme(0, null);
      this.barInTheme = 0;
      this.globalBar = 0;
      this.elapsedSeconds = 0;
      this.previousVoicing = null;
      this.previousMelody = null;
      this.previousBass = 36 + this.theme.key;
      this._nextTheme = null;
      this._captureThemeStart();
    }
    _captureThemeStart(){
      this._themeStart=clone({theme:this.theme,globalBar:this.globalBar,elapsedSeconds:this.elapsedSeconds,
        previousVoicing:this.previousVoicing,previousMelody:this.previousMelody,previousBass:this.previousBass});
    }
    getThemeStart(){return clone(this._themeStart);}
    restoreTheme(snapshot){
      const s=clone(snapshot);
      for(const key of ['theme','globalBar','elapsedSeconds','previousVoicing','previousMelody','previousBass'])this[key]=s[key];
      this.barInTheme=0;this._nextTheme=null;this._captureThemeStart();
    }
    _makeTheme(index, previous) {
      const c = this.config, r = mulberry32(hash(c.seed, index + 1000));
      let pool = PROFILES;
      if (c.audioChannel === 'lofi') pool = PROFILES.filter(p=>['letter','falling','water','cafe'].includes(p.id));
      if (c.audioChannel === 'late_fm') pool = PROFILES.filter(p=>['cafe','blue','moon','falling'].includes(p.id));
      if (c.audioChannel === 'nocturne') pool = PROFILES.filter(p=>['moon','blue','candle','water'].includes(p.id));
      if (c.audioChannel === 'ambient') pool = PROFILES.filter(p=>['window','water','moon','letter'].includes(p.id));
      if (previous) pool = pool.filter(p=>p.id !== previous.profileId);
      const profile = pick(r,pool);
      let key = pick(r,[0,2,5,7,9]);
      if (previous) {
        const relative = previous.mode==='major' && profile.mode==='minor' ? 9 :
          previous.mode==='minor' && profile.mode==='major' ? 3 : 0;
        key = pc(previous.key + pick(r,[relative,relative,0,5,7]));
      }
      const bpm = ({ambient:56,nocturne:60,lofi:62,late_fm:64,jazz:66}[c.audioChannel]) + Math.floor(r()*13);
      const barSeconds = 240/bpm;
      const minPhrases = Math.ceil(c.themeMinSeconds/(4*barSeconds));
      const maxPhrases = Math.floor(c.themeMaxSeconds/(4*barSeconds));
      const bars = 4*(minPhrases + Math.floor(r()*(maxPhrases-minPhrases+1)));
      const motif = [0];
      for (let i=1;i<8;i++) {
        const step=pick(r,[-2,-1,1,1,2,3]);
        const next=motif[i-1]+step;
        motif.push(next>5||next< -3 ? motif[i-1]-step : next);
      }
      motif[7] = pick(r,[0,1,2]);
      return {
        index, profileId:profile.id, name:profile.name, mode:profile.mode, key,
        keyName:NAMES[key] + (profile.mode==='major'?' major':profile.mode==='minor'?' minor':' dorian'),
        bpm, barSeconds, bars, durationSeconds:bars*barSeconds, motif,
        rhythmIndex:Math.floor(r()*RHYTHMS.length), home:pick(r,[7,8,9]),
        lead:c.audioChannel==='nocturne'?'vibes':c.audioChannel==='lofi'?'rhodes':profile.lead,
        pan:(r()-.5)*.28, swing: c.audioChannel==='jazz'||c.audioChannel==='late_fm' ? .10+r()*.07 : .035,
        resolvedAmbience:c.ambientLayer==='random'?pick(r,['rain','vinyl','birds']):c.ambientLayer
      };
    }
    _chord(theme, bar) {
      const p = PROGRESSIONS[theme.profileId];
      const harmonicBar=this.config.audioChannel==='ambient'?Math.floor(bar/2):bar;
      let [degree,quality] = p[harmonicBar % p.length];
      // A complete four-bar cadence, then a breath before the new theme.
      if (bar >= theme.bars-4) {
        const ending=theme.mode==='major'?[[2,'m9'],[7,'13'],[0,'6/9'],[0,'6/9']]:
          theme.mode==='minor'?[[2,'m7b5'],[7,'7(♭9,♭13)'],[0,'m9'],[0,'m9']]:
          [[5,'13sus4'],[0,'m11'],[0,'m9'],[0,'m9']];
        [degree,quality]=ending[bar-(theme.bars-4)];
      }
      // The secondary dominant always leads to ii; no random altered chord swaps.
      if (bar<theme.bars-4 && theme.profileId==='cafe' && harmonicBar%8===1 && this.config.tension < .25) quality='m9';
      const rootPc = pc(theme.key+degree);
      return { root:rootPc, quality, name:NAMES[rootPc]+quality,
        pitchClasses:QUALITIES[quality].tones.map(n=>pc(n+rootPc)) };
    }
    requestNextTheme() { this.barInTheme = this.theme.bars; }
    nextBar() {
      if (this.barInTheme >= this.theme.bars) {
        this.theme = this._nextTheme || this._makeTheme(this.theme.index+1,this.theme);
        this._nextTheme = null; this.barInTheme=0;
        this._captureThemeStart();
      }
      const t=this.theme, b=this.barInTheme, c=this.config;
      const r=mulberry32(hash(c.seed, this.globalBar+20000));
      const fraction=b/t.bars;
      const section=b<4?'intro':b>=t.bars-4?'coda':fraction<.35?'theme':fraction<.63?'development':fraction<.76?'breathing':'reprise';
      const chord=this._chord(t,b);
      let nextChord;
      if (b===t.bars-1) {
        this._nextTheme=this._makeTheme(t.index+1,t);
        nextChord=this._chord(this._nextTheme,0);
      } else nextChord=this._chord(t,b+1);
      const voicing=voiceLead(chord.root,chord.quality,this.previousVoicing);
      this.previousVoicing=voicing;
      const beat=60/t.bpm, events=[];
      const add=(inst,midi,at,length,velocity,pan=0)=>events.push({
        kind:'note',inst,midi,offset:at*beat,duration:Math.max(.05,length*beat),velocity,pan
      });
      const quiet=section==='breathing'||section==='intro'||section==='coda';
      const restingBar=b===t.bars-1 || (b%8===7 && section==='breathing');
      const dynamic=(quiet?.76:1)*(0.92+0.08*Math.sin((b%8)/8*TAU));
      // Root in a playable upright register, then chord fifth or a short approach.
      const roots=[];
      for(let n=28;n<=45;n++) if(pc(n)===chord.root) roots.push(n);
      roots.sort((a,z)=>Math.abs(a-this.previousBass)-Math.abs(z-this.previousBass));
      const bass=roots[0]; this.previousBass=bass;
      if (!restingBar) {
        add('bass',bass,0,quiet?2.6:1.8,.12*dynamic);
        if (!quiet && c.audioChannel!=='ambient' && r()<.76) {
          const fifth=QUALITIES[chord.quality].tones.includes(7)?7:QUALITIES[chord.quality].tones.includes(6)?6:12;
          add('bass',bass+fifth,2,1.3,.082*dynamic);
          if (b%4===3 && b<t.bars-2 && r()<.5) {
            let target=36+nextChord.root;
            while(target-bass>7) target-=12;
            while(target-bass< -7) target+=12;
            add('bass',target+(r()<.6?-1:1),3.5,.38,.062*dynamic);
          }
        }
      }
      const compAt=(b%4===2 && !quiet)?.45:0;
      if (!restingBar) voicing.forEach((n,i)=>{
        add('rhodes',n,compAt+i*.028,
          Math.min(quiet?3.4:2.8,3.8-compAt-i*.028),(.043+(i===3?.006:0))*dynamic,
          (i-1.5)*.035);
      });
      // A two-bar motif is restated, answered and developed rather than discarded.
      let rhythm=RHYTHMS[(t.rhythmIndex+(section==='development'?Math.floor(b/4)%3:0))%RHYTHMS.length];
      const phrasePosition=b%8;
      const silent=restingBar || (phrasePosition===7) || (quiet && b%2===1) || (c.audioChannel==='ambient'&&b%3===2);
      const melody=[];
      if (!silent) {
        const maxNotes=quiet?1:Math.round(1+c.density*4);
        rhythm=rhythm.slice(0,maxNotes);
        rhythm.forEach((position,j)=>{
          if (j>0 && r()>.74+c.density*.22) return;
          const motifIndex=((b%2)*3+j)%t.motif.length;
          let contour=t.motif[motifIndex];
          if (section==='development') contour=(Math.floor(b/4)%2?-contour:contour)+pick(r,[-1,0,0,1]);
          else if (phrasePosition>=4) contour+=1; // answer phrase
          const degree=t.home+contour;
          const scale=SCALES[t.mode];
          const target=60+t.key+12*Math.floor(degree/7)+scale[((degree%7)+7)%7]-12;
          const strong=Number.isInteger(position)&&position%2===0 || j===rhythm.length-1;
          const core=QUALITIES[chord.quality].tones.filter(n=>n<12).map(n=>pc(chord.root+n));
          const allowed=strong?core:chord.pitchClasses;
          const midi=nearPitch(target,allowed,this.previousMelody,64,83);
          this.previousMelody=midi;
          const swing=(position%1===.5)?t.swing:0;
          const onset=position+swing+(r()-.5)*.025;
          const nextPosition=rhythm[j+1]===undefined?3.95:rhythm[j+1];
          const length=Math.min(nextPosition-onset-.09,3.98-onset,quiet?1.9:1.25);
          if(length<.12) return;
          const vel=(.060+(j===0?.008:0))*(.88+r()*.20)*dynamic;
          add(t.lead,midi,Math.max(.01,onset),length,vel,t.pan);
          melody.push(midi);
        });
      }
      if(!quiet && !['ambient','nocturne'].includes(c.audioChannel)) {
        for (const at of [1,3]) if(r()<.78) events.push({kind:'brush',offset:at*beat,duration:.20,velocity:.012*dynamic});
      }
      events.sort((a,z)=>a.offset-z.offset);
      const result={
        globalBar:this.globalBar, barInTheme:b, duration:t.barSeconds,
        elapsedSeconds:this.elapsedSeconds, chord, nextChord, voicing, melody, section,
        theme:{...t,motif:t.motif.slice()}, events
      };
      this.globalBar++; this.barInTheme++; this.elapsedSeconds+=t.barSeconds;
      return result;
    }
  }

  class PeommoodAudioEngine {
    constructor(userConfig = {}, dependencies = {}) {
      const initial=recipe(userConfig);
      this.config=initial.config;
      this.audioCtx=dependencies.audioContext || null;
      this._ownsContext=!dependencies.audioContext;
      this._offline=Boolean(dependencies.offline);
      this._initialized=false; this._disposed=false;
      this.isMusicPlaying=false; this._wantPlaying=false; this._generation=0;
      this.musicLoopTimer=null; this._suspendTimer=null; this._startPromise=null;
      this._voices=new Set(); this._persistent=[]; this._persistentSources=[];
      this._noiseSources=[]; this._events=[]; this._metaQueue=[];
      this._nextBarTime=0; this._composer=new Composer(this.config);
      if(initial.snapshot)this._composer.restoreTheme(initial.snapshot);
      this._activeThemeStart=this._composer.getThemeStart();
      this.chordStep=0; this.onStateChange=null; this.onThemeChange=null; this.onError=null;
      this.currentTrackMeta=this._metadata(null,this._composer.theme);
      this.stats={ scheduledNotes:0, peakVoices:0, stolenVoices:0, resyncs:0, skippedEvents:0 };
      this._visibilityHandler=()=>{if(this.isMusicPlaying)this._tick();};
      this._stateHandler=()=>{
        if(this.audioCtx?.state==='running'&&this.isMusicPlaying)this._tick();
        this._emitChange();
      };
    }
    static get version(){return VERSION;}
    static get defaults(){return {...DEFAULTS};}
    static fromCode(code){return new PeommoodAudioEngine(code);}
    static decodeCode(code){return decodeCode(code);}
    exportCode({scope='theme'}={}){
      if(!['theme','journey'].includes(scope))throw new RangeError('Unknown code scope');
      const snapshot=scope==='theme'?clone(this._activeThemeStart):null;
      if(snapshot)snapshot.theme.resolvedAmbience=this.currentTrackMeta.resolvedAmbience;
      return encodeCode(this.config,snapshot);
    }
    loadCode(code){
      if(this._disposed)throw new Error('This Peommood engine has been disposed.');
      const next=recipe(code); // Validate fully before touching the running transport.
      this.config=next.config;
      this.initializeSeedTrack(this.config.seed,next.snapshot);
      return this.getState();
    }
    createSeededRandom(seed){return mulberry32(seed);}
    _metadata(bar,theme) {
      return { bpm:theme.bpm, keyName:theme.keyName, pitchFactor:Math.pow(2,theme.key/12),
        barMs:theme.barSeconds*1000, themeIndex:theme.index, themeName:theme.name,
        themeDurationSeconds:theme.durationSeconds, themeElapsedSeconds:(bar?.barInTheme||0)*theme.barSeconds,
        section:bar?.section||'intro', chordName:bar?.chord.name||'',
        resolvedAmbience:this.config.ambientLayer==='random'?theme.resolvedAmbience:this.config.ambientLayer,
        globalBar:bar?.globalBar||0 };
    }
    _node(node){this._persistent.push(node);return node;}
    _gain(value){const n=this._node(this.audioCtx.createGain());n.gain.value=value;return n;}
    _filter(type,freq,q=.707){const n=this._node(this.audioCtx.createBiquadFilter());n.type=type;n.frequency.value=freq;n.Q.value=q;return n;}
    initAudioEngine() {
      if(this._disposed)throw new Error('This Peommood engine has been disposed.');
      if(this._initialized)return;
      if(!this.audioCtx){
        const Context=root.AudioContext||root.webkitAudioContext;
        if(!Context)throw new Error('Web Audio API is not available in this environment.');
        this.audioCtx=new Context({latencyHint:'playback'});
      }
      const a=this.audioCtx;
      this.masterGain=this._gain(0);
      this.compressor=this._node(a.createDynamicsCompressor());
      this.compressor.threshold.value=-12;this.compressor.knee.value=12;
      this.compressor.ratio.value=2;this.compressor.attack.value=.012;this.compressor.release.value=.25;
      this.masterGain.connect(this.compressor);this.compressor.connect(a.destination);
      this.musicBus=this._gain(.85);this.ambientBus=this._gain(1);
      this.toneFilter=this._filter('lowpass',2600);
      this.musicBus.connect(this.toneFilter);this.toneFilter.connect(this.masterGain);
      this.ambientBus.connect(this.masterGain);
      this.rhodesBus=this._gain(1);this.leadBus=this._gain(1);this.bassBus=this._gain(1);
      this.stereoPanner=this._node(a.createStereoPanner());
      this.rhodesBus.connect(this.stereoPanner);this.stereoPanner.connect(this.musicBus);
      this.leadBus.connect(this.musicBus);this.bassBus.connect(this.musicBus);
      this.tremoloLfo=this._node(a.createOscillator());this.tremoloDepth=this._gain(.13);
      this.tremoloLfo.frequency.value=2.7;
      this.tremoloLfo.connect(this.tremoloDepth);this.tremoloDepth.connect(this.stereoPanner.pan);
      this.tremoloLfo.start();this._persistentSources.push(this.tremoloLfo);
      // Generated stereo room response: early reflections + diffuse, damped tail.
      this.roomInput=this._filter('highpass',210);
      this.room=this._node(a.createConvolver());this.room.normalize=true;
      this.room.buffer=this._roomImpulse();this.reverbGain=this._gain(.13);
      this.rhodesBus.connect(this.roomInput);this.leadBus.connect(this.roomInput);
      this.roomInput.connect(this.room);this.room.connect(this.reverbGain);this.reverbGain.connect(this.musicBus);
      // Optional quiet warm echo, separate from the diffuse room.
      this.echoSend=this._gain(.07);this.reverbDelay=this._node(a.createDelay(1));
      this.reverbDelay.delayTime.value=.29;
      this.reverbFilter=this._filter('lowpass',1600);
      this.echoHighpass=this._filter('highpass',220);
      this.reverbFeedback=this._gain(.18);this.echoReturn=this._gain(.20);
      this.rhodesBus.connect(this.echoSend);this.leadBus.connect(this.echoSend);
      this.echoSend.connect(this.reverbDelay);this.reverbDelay.connect(this.reverbFilter);
      this.reverbFilter.connect(this.echoHighpass);this.echoHighpass.connect(this.reverbFeedback);
      this.reverbFeedback.connect(this.reverbDelay);this.echoHighpass.connect(this.echoReturn);
      this.echoReturn.connect(this.musicBus);
      this.noiseGain=this._gain(0);this.noiseFilter=this._filter('lowpass',1800);
      this.noiseFilter.connect(this.noiseGain);this.noiseGain.connect(this.ambientBus);
      this._hitBuffer=this._makeNoise(.3,hash(this.config.seed,80001),false);
      this._rebuildNoise();this._applyMood();
      this._initialized=true;
      if(!this._offline){
        a.addEventListener('statechange',this._stateHandler);
        if(root.document)root.document.addEventListener('visibilitychange',this._visibilityHandler);
      }
    }
    _roomImpulse() {
      const a=this.audioCtx, sr=a.sampleRate, length=Math.ceil(sr*2.2);
      const buffer=a.createBuffer(2,length,sr), r=mulberry32(0x506f656d);
      for(let ch=0;ch<2;ch++){
        const d=buffer.getChannelData(ch);let low=0;
        for(let i=0;i<length;i++){
          const time=i/sr;low=.68*low+.32*(r()*2-1);
          const fade=Math.min(1,Math.max(0,(time-.014)/.025));
          d[i]=low*Math.exp(-time/ .38)*fade*.17;
        }
        for(const [delay,level] of [[.021,.6],[.037,.37],[.061,.24],[.089,.12]]){
          d[Math.floor((delay+ch*.003)*sr)]+=level;
        }
      }
      return buffer;
    }
    _makeNoise(seconds,seed,loop=true) {
      const a=this.audioCtx, n=Math.ceil(seconds*a.sampleRate), blend=Math.floor(a.sampleRate*.15);
      const buffer=a.createBuffer(1,n,a.sampleRate), data=buffer.getChannelData(0), r=mulberry32(seed);
      const raw=new Float32Array(n+(loop?blend:0));let brown=0,pink=0;
      const alpha=Math.exp(-TAU*45/a.sampleRate);
      for(let i=0;i<raw.length;i++){
        const white=r()*2-1;
        brown=alpha*brown+(1-alpha)*white;
        pink=.96*pink+.04*white;
        raw[i]=loop?(brown*2.4+pink*.65+white*.035):white;
      }
      for(let i=0;i<n;i++){
        if(loop&&i<blend){const f=i/blend;data[i]=raw[n+i]*(1-f)+raw[i]*f;}
        else data[i]=raw[i];
      }
      return buffer;
    }
    _rebuildNoise() {
      for(const s of this._noiseSources){try{s.stop();}catch(_){}s.disconnect();}
      this._noiseSources=[];
      for(let i=0;i<2;i++){
        const s=this.audioCtx.createBufferSource();
        s.buffer=this._makeNoise(i?11.3:7.7,hash(this.config.seed,90000+i));s.loop=true;
        s.connect(this.noiseFilter);s.start();this._noiseSources.push(s);
      }
    }
    _hold(param,time){
      if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(time);
      else {const value=param.value;param.cancelScheduledValues(time);param.setValueAtTime(value,time);}
    }
    _target(param,value,seconds=.25){
      const now=this.audioCtx.currentTime;this._hold(param,now);
      param.setTargetAtTime(value,now,seconds);
    }
    _applyMood(){
      const c=this.config;
      this._target(this.toneFilter.frequency,4200-c.warmth*2500,.6);
      this._target(this.reverbGain.gain,(c.richAudio?.06:.025)+c.space*.17,.6);
      this._target(this.echoSend.gain,c.richAudio?.025+c.space*.055:0,.6);
      this._target(this.tremoloDepth.gain,c.richAudio?.10:0,.6);
    }
    getTargetNoiseGain(){
      const amb=this.config.ambientLayer==='random'?this.currentTrackMeta.resolvedAmbience:this.config.ambientLayer;
      return (amb==='none'?0:amb==='rain'?.045:amb==='birds'?.025:.018)*this.config.ambienceLevel/5;
    }
    _updateAmbience(){
      this._target(this.noiseGain.gain,this.getTargetNoiseGain(),.8);
      const amb=this.currentTrackMeta.resolvedAmbience;
      this._target(this.noiseFilter.frequency,amb==='rain'?1400:amb==='birds'?1300:2200,.8);
    }
    _registerVoice(sources,nodes,gain,end) {
      if(!this._offline && this._voices.size>=this.config.maxVoices){
        const oldest=this._voices.values().next().value;
        for(const s of oldest.sources){try{s.stop();}catch(_){}}
        this._cleanVoice(oldest);this.stats.stolenVoices++;
      }
      const voice={sources,nodes,gain,end,remaining:sources.length,cleaned:false};
      this._voices.add(voice);
      for(const s of sources)s.onended=()=>{if(--voice.remaining===0)this._cleanVoice(voice);};
      this.stats.scheduledNotes++;this.stats.peakVoices=Math.max(this.stats.peakVoices,this._voices.size);
      return voice;
    }
    _cleanVoice(v){
      if(v.cleaned)return;v.cleaned=true;
      for(const s of v.sources)s.onended=null;
      for(const n of v.nodes)n.disconnect();
      this._voices.delete(v);
    }
    _releaseVoices(fade=.10){
      if(!this.audioCtx)return;
      const now=this.audioCtx.currentTime;
      for(const v of this._voices){
        this._hold(v.gain.gain,now);v.gain.gain.linearRampToValueAtTime(0,now+fade);
        for(const s of v.sources){try{s.stop(now+fade+.01);}catch(_){}}
      }
    }
    playInstrumentNote(freq,startTime,duration,inst='rhodes',velocity=.07,pan=0,ambient=false){
      if(!this._initialized||(!this.isMusicPlaying&&!this._offline))return;
      if(![freq,startTime,duration,velocity,pan].every(Number.isFinite)||freq<=0||duration<=0)return;
      const a=this.audioCtx,t=Math.max(a.currentTime,startTime),d=Math.max(.05,duration),end=t+d;
      const gain=a.createGain(),filter=a.createBiquadFilter(),panner=a.createStereoPanner();
      const nodes=[gain,filter,panner],sources=[];
      filter.type='lowpass';panner.pan.value=clamp(pan,-.5,.5);
      filter.connect(gain);gain.connect(panner);
      panner.connect(ambient?this.ambientBus:inst==='bass'?this.bassBus:inst==='rhodes'?this.rhodesBus:this.leadBus);
      function partial(type,ratio,level,life=d+.03){
        const osc=a.createOscillator(),g=a.createGain();nodes.push(osc,g);sources.push(osc);
        osc.type=type;osc.frequency.setValueAtTime(Math.min(freq*ratio,a.sampleRate*.45),t);
        g.gain.setValueAtTime(level,t);osc.connect(g);g.connect(filter);
        osc.start(t);osc.stop(t+life);return {osc,g};
      }
      let attack=.012,decay=.22,sustain=.44;
      if(inst==='bass'){
        partial('triangle',1,.68);partial('sine',1,.32);
        filter.Q.value=1.4;filter.frequency.setValueAtTime(Math.max(650,freq*6),t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(190,freq*2.1),t+.12);
        attack=.008;decay=.12;sustain=.44;
      }else if(inst==='jazz_guitar'){
        partial('triangle',1,.85);partial('sine',2,.13);
        filter.frequency.setValueAtTime(2100,t);filter.frequency.exponentialRampToValueAtTime(850,t+.25);
        attack=.006;decay=.14;sustain=.32;
      }else if(inst==='vibes'){
        partial('sine',1,1);
        const p=partial('sine',3.99,.12,Math.min(d,.45)+.03);
        p.g.gain.exponentialRampToValueAtTime(EPS,t+Math.min(d,.45));
        filter.frequency.value=4200;attack=.008;decay=.25;sustain=.52;
      }else{
        partial('sine',1,1);partial('sine',2,.17);partial('sine',3,.035);
        filter.frequency.value=1900+clamp(velocity,0,.15)*4000;
        if(this.config.richAudio){
          const ratio=4.18+.10*clamp(Math.log2(freq/110)/4,0,1);
          const p=partial('sine',ratio,.14,Math.min(d,.095)+.005);
          p.g.gain.setValueAtTime(EPS,t);p.g.gain.linearRampToValueAtTime(.10+velocity*.6,t+.003);
          p.g.gain.exponentialRampToValueAtTime(EPS,t+Math.min(d,.095));
        }
      }
      attack=Math.min(attack,d*.15);decay=Math.min(decay,d*.45);
      const v=clamp(velocity,0,.25);
      gain.gain.setValueAtTime(EPS,t);gain.gain.linearRampToValueAtTime(Math.max(EPS,v),t+attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(EPS,v*sustain),t+Math.max(attack+.001,decay));
      gain.gain.exponentialRampToValueAtTime(EPS,end);
      gain.gain.linearRampToValueAtTime(0,end+.025);
      this._registerVoice(sources,nodes,gain,end+.04).ambient=ambient;
    }
    _noiseHit(event,time){
      const a=this.audioCtx,source=a.createBufferSource(),filter=a.createBiquadFilter(),g=a.createGain();
      const t=Math.max(a.currentTime,time),d=event.duration;
      source.buffer=this._hitBuffer;
      filter.type=event.kind==='tick'?'highpass':'bandpass';
      filter.frequency.value=event.kind==='tick'?1800:2600;filter.Q.value=.7;
      g.gain.setValueAtTime(EPS,t);g.gain.linearRampToValueAtTime(event.velocity,t+.002);
      g.gain.exponentialRampToValueAtTime(EPS,t+d);
      source.connect(filter);filter.connect(g);g.connect(event.kind==='tick'?this.ambientBus:this.musicBus);
      source.start(t);source.stop(t+d+.005);
      this._registerVoice([source],[source,filter,g],g,t+d+.005).ambient=event.kind==='tick';
    }
    _ambientEvents(bar){
      const amb=this.config.ambientLayer==='random'?bar.theme.resolvedAmbience:this.config.ambientLayer;
      const level=this.config.ambienceLevel/5;
      if(amb==='none'||level===0)return [];
      const r=mulberry32(hash(this.config.seed,bar.globalBar+500000));
      const out=[];
      if(amb==='vinyl'&&this.config.richAudio){
        let t=-Math.log(1-r())/.30;
        while(t<bar.duration && out.length<4){
          out.push({kind:'tick',offset:t,duration:.004+r()*.009,velocity:(.006+r()*.011)*level});
          t+=-Math.log(1-r())/.30;
        }
      }
      if(amb==='birds'&&bar.globalBar%2===0&&r()<.22){
        out.push({kind:'note',inst:'vibes',midi:84+Math.floor(r()*6),offset:.8,
          duration:.16,velocity:.009*level,pan:(r()-.5)*.7});
      }
      return out.map(event=>({...event,ambient:true}));
    }
    _renderEvent(event,time){
      if(event.kind==='note')this.playInstrumentNote(hz(event.midi),time,event.duration,event.inst,event.velocity,event.pan||0,event.ambient||false);
      else this._noiseHit(event,time);
    }
    _enqueueBar(time){
      const bar=this._composer.nextBar();
      for(const event of bar.events.concat(this._ambientEvents(bar)))this._events.push({...event,time:time+event.offset});
      this._events.sort((a,b)=>a.time-b.time);
      this._metaQueue.push({time,bar,startState:this._composer.getThemeStart()});
      this._nextBarTime=time+bar.duration;
    }
    _tick(){
      if(!this.isMusicPlaying||this._disposed)return;
      if(this.musicLoopTimer!==null){clearTimeout(this.musicLoopTimer);this.musicLoopTimer=null;}
      try{
        const now=this.audioCtx.currentTime;
        if(this.audioCtx.state==='running'){
          // Never replay a backlog in a burst after a long main-thread stall.
          const overdue=this._events.length?this._events[0].time:this._nextBarTime;
          if(now-overdue>.55){
            this.stats.resyncs++;this.stats.skippedEvents+=this._events.length;
            this._events=[];this._metaQueue=[];this._nextBarTime=now+.07;
          }
          const horizon=now+this.config.lookAheadSeconds;
          while(this._nextBarTime<horizon)this._enqueueBar(this._nextBarTime);
          while(this._events.length&&this._events[0].time<horizon){
            const e=this._events.shift();
            if(e.time<now-.08){this.stats.skippedEvents++;continue;}
            this._renderEvent(e,Math.max(e.time,now+.003));
          }
          while(this._metaQueue.length&&this._metaQueue[0].time<=now){
            const {bar,startState}=this._metaQueue.shift();
            this._activeThemeStart=startState;
            const changed=bar.theme.index!==this.currentTrackMeta.themeIndex || this.chordStep===0;
            this.currentTrackMeta=this._metadata(bar,bar.theme);this.chordStep=bar.globalBar+1;
            this._updateAmbience();this._emitChange();
            if(changed)this._callback(this.onThemeChange,{...this.currentTrackMeta});
          }
        }
      }catch(error){
        this.stop();this._callback(this.onError,error);return;
      }
      this.musicLoopTimer=setTimeout(()=>this._tick(),this.config.schedulerIntervalMs);
    }
    async start(){
      if(this._disposed)throw new Error('This Peommood engine has been disposed.');
      if(this.isMusicPlaying)return;
      if(this._wantPlaying&&this._startPromise)return this._startPromise;
      this._wantPlaying=true;const generation=++this._generation;
      if(this._suspendTimer!==null){clearTimeout(this._suspendTimer);this._suspendTimer=null;}
      const promise=(async()=>{
        this.initAudioEngine();
        if(this.audioCtx.state!=='running')await this.audioCtx.resume();
        if(generation!==this._generation||!this._wantPlaying||this._disposed)return;
        this.isMusicPlaying=true;
        this._events=[];this._metaQueue=[];this._nextBarTime=this.audioCtx.currentTime+.08;
        this._target(this.masterGain.gain,this.config.volume,.35);this._updateAmbience();
        this._tick();this._emitChange();
      })();
      this._startPromise=promise;
      try{await promise;}catch(error){
        if(generation===this._generation){this._wantPlaying=false;this.isMusicPlaying=false;}
        this._callback(this.onError,error);throw error;
      }finally{if(this._startPromise===promise)this._startPromise=null;}
    }
    stop(){
      this._wantPlaying=false;this.isMusicPlaying=false;const generation=++this._generation;
      if(this.musicLoopTimer!==null){clearTimeout(this.musicLoopTimer);this.musicLoopTimer=null;}
      if(this._suspendTimer!==null){clearTimeout(this._suspendTimer);this._suspendTimer=null;}
      this._events=[];this._metaQueue=[];
      if(this._initialized){
        this._releaseVoices(.12);this._target(this.masterGain.gain,0,.045);
        if(!this._offline&&this._ownsContext)this._suspendTimer=setTimeout(()=>{
          this._suspendTimer=null;
          if(generation===this._generation&&!this._wantPlaying&&this.audioCtx.state==='running'){
            this.audioCtx.suspend().catch(e=>this._callback(this.onError,e));
          }
        },240);
      }
      this._emitChange();
    }
    setMusicState(on){if(on)return this.start();this.stop();return Promise.resolve();}
    toggleMusic(){return this.setMusicState(!this._wantPlaying);}
    toggleRichAudio(on){this.config.richAudio=Boolean(on);this._composer.config.richAudio=this.config.richAudio;if(this._initialized)this._applyMood();this._emitChange();}
    updateVolume(value){this.config.volume=num(value,this.config.volume,0,1);if(this.isMusicPlaying)this._target(this.masterGain.gain,this.config.volume,.2);this._emitChange();}
    _clearAmbientEvents(){
      this._events=this._events.filter(e=>!e.ambient);
      if(!this.audioCtx)return;
      const time=this.audioCtx.currentTime;
      for(const v of this._voices)if(v.ambient){
        this._hold(v.gain.gain,time);v.gain.gain.linearRampToValueAtTime(0,time+.025);
        for(const s of v.sources){try{s.stop(time+.03);}catch(_){}}
      }
    }
    updateAmbienceLevel(value){this.config.ambienceLevel=num(value,this.config.ambienceLevel,0,10);this._clearAmbientEvents();if(this._initialized)this._updateAmbience();this._emitChange();}
    setPoeticMood(mood={}){
      for(const key of ['warmth','space','density','tension'])if(key in mood){
        this.config[key]=num(mood[key],this.config[key],0,1);this._composer.config[key]=this.config[key];
      }
      if(this._initialized)this._applyMood();this._emitChange();
    }
    initializeSeedTrack(seed,snapshot=null){
      this.config.seed=num(seed,DEFAULT_SEED,0,0xffffffff)>>>0;
      this._composer=new Composer(this.config);this.chordStep=0;
      if(snapshot)this._composer.restoreTheme(snapshot);
      this._activeThemeStart=this._composer.getThemeStart();
      this.currentTrackMeta=this._metadata(null,this._composer.theme);
      if(this._initialized){
        this._releaseVoices(.08);this._rebuildNoise();
        this._hitBuffer=this._makeNoise(.3,hash(this.config.seed,80001),false);
        this._updateAmbience();
        this._applyMood();
        if(this.isMusicPlaying)this._target(this.masterGain.gain,this.config.volume,.2);
      }
      this._events=[];this._metaQueue=[];
      if(this.isMusicPlaying){this._nextBarTime=this.audioCtx.currentTime+.12;this._tick();}
      this._emitChange();return this.config.seed;
    }
    changeAudioChannel(channel){
      if(!CHANNELS.includes(channel))throw new RangeError('Unknown audio channel: '+channel);
      this.config.audioChannel=channel;this.initializeSeedTrack(this.config.seed);
      return this.isMusicPlaying?Promise.resolve():this.start();
    }
    changeAmbientLayer(layer){
      if(!AMBIENCES.includes(layer))throw new RangeError('Unknown ambience: '+layer);
      this.config.ambientLayer=layer;this._composer.config.ambientLayer=layer;
      this._clearAmbientEvents();
      const theme=this._composer.theme;
      this.currentTrackMeta.resolvedAmbience=layer==='random'?
        pick(mulberry32(hash(this.config.seed,theme.index+70000)),['rain','vinyl','birds']):layer;
      theme.resolvedAmbience=this.currentTrackMeta.resolvedAmbience;
      for(const pending of this._metaQueue)if(pending.bar.theme.index===theme.index)
        pending.bar.theme.resolvedAmbience=theme.resolvedAmbience;
      if(this._initialized)this._updateAmbience();this._emitChange();
    }
    nextTheme(){
      // Musical changes happen when the next unplanned bar is generated.
      this._composer.requestNextTheme();return this.getState();
    }
    nextRandomSeed(){
      return this.initializeSeedTrack(randomSeed());
    }
    resetDefaultSeed(){return this.initializeSeedTrack(DEFAULT_SEED);}
    getState(){return {isPlaying:this.isMusicPlaying,config:{...this.config},meta:{...this.currentTrackMeta},
      diagnostics:{...this.stats,activeVoices:this._voices.size,queuedEvents:this._events.length,audioState:this.audioCtx?.state||'uninitialized'}};}
    _callback(fn,value){if(typeof fn==='function'){try{fn(value);}catch(e){if(root.console)root.console.error('Peommood callback error',e);}}}
    _emitChange(){this._callback(this.onStateChange,this.getState());}
    async dispose(){
      if(this._disposed)return;
      this.stop();this._disposed=true;
      if(this._suspendTimer!==null){clearTimeout(this._suspendTimer);this._suspendTimer=null;}
      if(this.audioCtx){
        if(!this._offline)this.audioCtx.removeEventListener('statechange',this._stateHandler);
        if(root.document)root.document.removeEventListener('visibilitychange',this._visibilityHandler);
        for(const v of Array.from(this._voices)){
          for(const s of v.sources){try{s.stop();}catch(_){}}this._cleanVoice(v);
        }
        for(const s of this._noiseSources.concat(this._persistentSources)){try{s.stop();}catch(_){}s.disconnect();}
        for(const n of this._persistent)n.disconnect();
        if(this._ownsContext&&this.audioCtx.state!=='closed'&&typeof this.audioCtx.close==='function')await this.audioCtx.close();
      }
      this._noiseSources=[];this._persistentSources=[];this._persistent=[];
      this._hitBuffer=null;if(this.room)this.room.buffer=null;
      this.onStateChange=null;this.onThemeChange=null;this.onError=null;
    }
    /** Short deterministic audition; returns AudioBuffer, not an external sample dependency. */
    static async renderPreview(config={},seconds=30,sampleRate=44100){
      const Offline=root.OfflineAudioContext||root.webkitOfflineAudioContext;
      if(!Offline)throw new Error('OfflineAudioContext is unavailable.');
      const duration=num(seconds,30,5,120),sr=Math.round(num(sampleRate,44100,22050,48000));
      const context=new Offline(2,Math.ceil(duration*sr),sr);
      const e=new PeommoodAudioEngine(config,{audioContext:context,offline:true});
      e.initAudioEngine();e.isMusicPlaying=true;
      e.masterGain.gain.cancelScheduledValues(0);e.masterGain.gain.setValueAtTime(0,0);
      e.masterGain.gain.linearRampToValueAtTime(e.config.volume,.5);
      e.masterGain.gain.setValueAtTime(e.config.volume,duration-1.5);
      e.masterGain.gain.linearRampToValueAtTime(0,duration);
      e._updateAmbience();
      let time=.1;
      while(time<duration-.2){
        const bar=e._composer.nextBar();
        for(const event of bar.events.concat(e._ambientEvents(bar)))if(time+event.offset<duration){
          e._renderEvent(event,time+event.offset);
        }
        time+=bar.duration;
      }
      try{return await context.startRendering();}finally{await e.dispose();}
    }
  }
  PeommoodAudioEngine.Composer=Composer;
  PeommoodAudioEngine.QUALITIES=QUALITIES;
  PeommoodAudioEngine.midiToFrequency=hz;
  return PeommoodAudioEngine;
});
