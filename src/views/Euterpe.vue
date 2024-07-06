<script>
/*
Import custom components
*/
import Keyboard from '@/components/Keyboard.vue';
import PianoRoll from '@/components/PianoRoll.vue';
import Score from '@/components/Score.vue';
// import VerticalSlider from '@/components/VerticalSlider.vue';
// import HorizontalSlider from '@/components/HorizontalSlider.vue'
import Slider from '@/components/Slider.vue';
import AudioMeter from '@/components/AudioMeter.vue';
// import VectorBar from "../components/VectorBar.vue";
import ChromaChart from '@/components/ChromaChart.vue';
import Monitor from '@/components/Monitor.vue';
import Mixer from '@/components/Mixer.vue';
import TextBox from '@/components/TextBox.vue';
import SettingsModal from '@/components/Settings.vue';

import '../css/main.css';
import * as Tone from 'tone';
import {Midi} from '@tonaljs/tonal';
import {WebMidi} from 'webmidi';
import AudioKeys from 'audiokeys';

import yaml from 'js-yaml';
import * as rb from 'ringbuf.js';
import {
    playerType, instrumentType, eventSourceType,
    messageType, statusType, noteType,
    uiParameterType,
    agentHookType,
} from '@/utils/types.js';

import {urlFromFiles, isMobile, isNotChrome} from '@/utils/helpers.js';
import {NoteEvent} from '@/utils/NoteEvent.js';
// import { selectedAgent } from '@/agent-examples/selectedAgent.js'

import configPlayers from '@/agent/config_players.yaml';
import configWidgets from '@/agent/config_widgets.yaml';
import configBase from '@/agent/config.yaml';
import { markdown } from '@/agent/introModal.md';


export default {

    name: 'mainScreen',

    components: {
        Keyboard,
        Score,
        PianoRoll,
        // VerticalSlider,
        // Slider,
        AudioMeter,
        TextBox,
        Mixer,
        Monitor,
        ChromaChart,
        SettingsModal
    },

    data() {
        return {
            config: { ...configBase, ...configPlayers, ...configWidgets },
            // intro text content
            intro_text_content: markdown,

            playerType,
            instrumentType,
            eventSourceType,
            messageType,
            statusType,
            noteType,
            uiParameterType,
            agentHookType,
            // These need to be initialized here
            // as empty arrays (computed properties)
            // They'll be filled in the created() hook
            switches: [],
            sliders: [],
            buttons: [],
            // Information about the players and
            // instruments available to each player.
            // It's used to create the mixer modal.
            // This is filled in the created() hook
            players: [],

            dataForMonitoring: {},

            // Score status
            // scoreShown: true,
            // TODO: Too many flags for score
            scrollStatus: true,
            scoreStatus: true,
            // Textbox status
            textBoxTitle: null,
            textBoxText: null,
            textBoxStatus: false,

            localBPM: null,
            // used to trigger local UI change
            localSyncClockStatus: false,
            screenWidth: document.body.clientWidth,
            screenHeight: document.body.clientHeight,
            keyboardKey: 0,
            keyboardoctaveStart: 0,
            keyboardoctaveEnd: 8,
            keyboardMaxRangeDisplayed: false,
            keyboardMinRangeDisplayed: false,

            // audioContext: null,
            mediaStreamSource: null,
            audioSettings: null,
            recorderWorkletNode: null,
            recorderWorkletBundle: null,

            sab: null,
            sab_par_ui: null,
            rb_par_ui: null,
            paramWriter: null,
            sab_par_agent: null,
            rb_par_agent: null,

            monitorObserverInterval: null,

            WebMIDISupport: false,
            pageLoadTime: null,
            modelLoadTime: null,
            activeDevices: [],
            selectedMIDIDevice: '',

            noteOffEventForNextTick: null,

            // used to calculate the average
            // agent inference time (gridBased mode)
            // and estimate maxBPM
            modelInferenceTimes: [],
            // maxBPM (or min clock period) supported by the current device
            maxBPM: 0,
            // counter for the number of times the agent
            // inference time exceeds the clock period
            misalignErrCount: 0,

            isNotChrome,
            isMobile,
            // Keep track of all the timeouts ids to
            // clear them when the the user pauses
            timeout_IDS_kill: [],
            timeout_IDS_live: [],

            mixer_data: null,

            agentLoaded: false,
            permissionAudio: false,
            permissionMIDI: false,
            permissionsGranted: false
        };
    },

    created() {
        const vm = this;

        console.log('created main start');

        this.$store.commit('setConfig', this.config);
        this.$store.commit('initQuantBuffers', this.config);
        this.$store.commit('setTicksPerMeasure', this.config);
        this.$store.commit('createInstruments', this.config);
        this.$store.commit('setNoteType', this.noteType);

        // Activate/Deactivate GUI widgets based on config
        this.scoreStatus = this.config.gui.score.status;
        this.textBoxStatus = this.config.gui.textBox.status;

        // Update the score properties
        // TODO: unclear use in Score.vue
        // this.scoreShown = this.config.gui.score.status;
        // this.scrollEnabled = this.config.gui.score;
        // Set the textBox title
        this.textBoxTitle = this.config.gui.textBox.title;

        // Set the octave range for the on-screen keyboard
        this.keyboardoctaveStart = this.config.gui.keyboard.octaveStart;
        this.keyboardoctaveEnd = this.config.gui.keyboard.octaveEnd;

        // Widgets configurations are stored and can be modified
        // in utils/widgets_config.js
        if (this.config.gui.settingsModal) {
            this.switches = this.config.gui.settingsModal.switches ?? this.switches;
            this.sliders = this.config.gui.settingsModal.sliders ?? this.sliders;
            this.buttons = this.config.gui.settingsModal.buttons ?? this.buttons;
        }

        this.players = this.config.players;

        // if (vm.config.gui.monitor && this.config.gui.monitor.status){
        if (this.showMonitor) {
            this.monitorObserverInterval = 10;
            if (this.config.gui.monitor.structure) {
                this.config.gui.monitor.structure.forEach((tab) => {
                    tab.parameters.forEach((parameter) => {
                        vm.dataForMonitoring[parameter.id] = 0;
                    });
                });
            }
        }
        this.localBPM = this.config.clockSettings.defaultBPM;
        console.log('created main end');
    },

    beforeMount() {
        console.log('beforeMount main start');
        // let vm = this;
        console.log('beforeMount main end');
    },

    async mounted() {
        console.log('main mounted');
        const vm = this;
        /*
        * Minor
        */
        window.onresize = () => {
            return (() => {
                window.screenWidth = document.body.clientWidth;
                vm.screenWidth = window.screenWidth;
            })();
        };

        // Prevent spacebar trigger any button
        // document.querySelectorAll('button').forEach(function(item) {
        //     item.addEventListener('focus', function() {
        //         this.blur();
        //     });
        // });
        document.querySelectorAll('button').forEach((item) => {
            item.addEventListener('focus', () => {
                item.blur();
            });
        });

        // spacebar trigger play btn
        document.addEventListener('keypress', function(event) {
            if (event.code == 'Space' && !vm.$store.getters.getModalStatus) {
                // spacebar could toggle clock
                vm.toggleClock();
            }
        });

        document.addEventListener('visibilitychange', function() {
            console.log('Visibility changed');
            console.log(vm.$refs.entryBtn.style.visibility);
        });

        window.onload = function() {
            console.log('window loaded');
        };
        
        if (vm.showMonitor) {
            console.log('MA DEN EPREPE');
            vm.$root.$refs.monitor.loadMonitorConfig(vm.config.gui.monitor);
        }
        vm.$root.$refs.mixer.loadMixerConfig(vm.config.players);

        /*
            * Loading Animation: set initial status of both div
            */
        vm.$refs.mainContent.style.display = 'none';
        vm.$refs.entryBtn.style.visibility = 'hidden';

        vm.audioContext = new AudioContext();
        // this cause huge latency for some reason
        // Tone.setContext(vm.audioContext);
        // increase it if you experience audio clicks
        Tone.context.lookAhead = 0;

        // SAB
        // get a memory region for the Audio ring buffer
        // length in time is 1 second of stereo audio
        // Float32Array is 4 bytes per sample
        vm.sab = rb.RingBuffer.getStorageForCapacity(
            vm.audioContext.sampleRate * 2, Float32Array);

        // get a memory region for the parameter ring buffer
        // This one is to send parameters from the UI to the agent
        vm.sab_par_ui = rb.RingBuffer.getStorageForCapacity(31, Uint8Array);
        vm.rb_par_ui = new rb.RingBuffer(vm.sab_par_ui, Uint8Array);
        vm.paramWriter = new rb.ParameterWriter(vm.rb_par_ui);

        // get a memory region for the parameter ring buffer
        // This one is to send parameters from the agent to the UI
        vm.sab_par_agent = rb.RingBuffer.getStorageForCapacity(31, Uint8Array);
        vm.rb_par_agent = new rb.RingBuffer(vm.sab_par_agent, Uint8Array);
        vm.paramReader = new rb.ParameterReader(vm.rb_par_agent);


        // Initialize agent worker
        vm.agent = new Worker(new URL(`../agent/agent.js`, import.meta.url), { type: 'module' });

        vm.agent.onmessage = vm.agentCallback;

        // Send a message to agent with some necessary
        // configurations and constants to store inside the agent
        // TODO : i removed await
        vm.agent.postMessage({
            hookType: vm.agentHookType.INIT_AGENT,
            content: {
                config: vm.config,
                playerType: vm.playerType,
                instrumentType: vm.instrumentType,
                messageType: vm.messageType,
                statusType: vm.statusType,
                noteType: vm.noteType,
                uiParameterType: vm.uiParameterType,
                agentHookType: vm.agentHookType,

                sab: vm.sab,
                sab_par_ui: vm.sab_par_ui,
                sab_par_agent: vm.sab_par_agent,
                channelCount: 2,
                sampleRate: vm.audioContext.sampleRate,
            },
        });

        if (vm.showMonitor) {
            if (vm.config.gui.monitor.structure) {
                vm.timeout_IDS_live.push(
                    setInterval(vm.agentParameterObserver, vm.monitorObserverInterval));
            }
        }


        // Initialize Clock Worker (module)
        vm.clockWorker = new Worker('/clock.js', {type: 'module'});
        vm.clockWorker.onmessage = vm.tickBehavior;
        vm.clockWorker.postMessage({action: 'setBPM', bpm: vm.localBPM});
        vm.$store.commit('initializeClock');

        if (vm.config.interactionMode.audioMode) {
            /*
            * Initialize Audio Recorder (for audio recording).
            */
            // vm.audio_sucess = true;
            // try {

            // TODO: this is not correct. Needs to be in a try/catch
            // but for some reason it doesn't work
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
            });
            console.log('Audio stream initialized');    
            vm.permissionAudio = true;
            // } catch (error) {
            //     console.error('Error accessing the microphone: ', error);
            //     vm.audio_success = false;
            // }

            if (vm.permissionAudio) {
                
                vm.mediaStreamSource = vm.audioContext.createMediaStreamSource(
                    stream,
                );
                console.log('Audio stream initialized');

                vm.analyserNode = vm.audioContext.createAnalyser();

                vm.mediaStreamSource.connect(vm.analyserNode);

                if (vm.config.gui.audioMeter.status) {
                    vm.$root.$refs.audioMeter.init(vm.analyserNode);
                    vm.$root.$refs.audioMeter.updateAnalysis();
                }
            
                // vm.$root.$refs.vectorBar.init();
                // vm.$root.$refs.vectorBar.updateAnalysis();
                vm.audioContext.resume(); // ?

                const recorderWorkletUrl = await urlFromFiles(
                    ['recorder-worklet.js', 'libraries/index_rb.js'],
                );
                await vm.audioContext.audioWorklet.addModule(recorderWorkletUrl);


                vm.recorderWorkletNode = new AudioWorkletNode(
                    vm.audioContext,
                    'recorder-worklet',
                    {processorOptions: vm.sab},
                );

                vm.recorderWorkletNode.port.postMessage('ping');

                vm.recorderWorkletNode.port.addEventListener('message', (event) => {
                    console.log('Received from Worklet' + event.data);
                });
                // vm.recorderWorkletNode.port.start(); # TODO do I need this for ping/pong ?
                // send the mic to the recorderNode --> recorderWorklet
                vm.mediaStreamSource.connect(vm.recorderWorkletNode);
                // vm.agentPlayer = new Tone.Player().toDestination();
            }
        }
        vm.audioContext.resume(); // ?
        /*
        * Web MIDI logic
        */
        // if (navigator.requestMIDIAccess) {
        //     navigator.requestMIDIAccess().then(function(access) {
        //         vm.WebMIDISupport = true;
        //         access.onstatechange = vm.onEnabled;
        //     })
        //     .catch(function(err) {
        //         console.log('requestMIDIAccess Error: ' + err);
        //     });
            
        //     // Enable WebMIDI, then call onEnabled method.
        //     WebMidi.enable()
        //         .then(vm.onEnabled)
        //         .catch((err) => console.log('WebMIDI Error: ' + err));
        // }
        try {
            if (navigator.requestMIDIAccess) {
                // Await MIDI permission
                await this.initializeMIDI();
                console.log('MIDI initialized');
                vm.permissionMIDI = true;
            }
        } catch (error) {
            console.error('Error initializing MIDI: ', error);
        }

        /*
        * Initialize computer keyboard logic
        * AudioKeys maps the computer keyboard to midi values
        */
        const keyboard = new AudioKeys({
            // set polyphony it to a very high number.
            // we will handle the polyphony ourselves.
            polyphony: 100,
            rows: 2,
            priority: 'last',
            rootNote: 60,
        });

        // callback for when a laptop keyboard key is pressed
        keyboard.down(function(note) {
            const noteName = Midi.midiToNoteName(note.note, {sharps: true});
            const newNoteEvent = new NoteEvent();
            newNoteEvent.player = vm.playerType.HUMAN;
            newNoteEvent.instrument = vm.instrumentType.PIANO;
            newNoteEvent.eventSource = vm.eventSourceType.KEYBOARD;
            newNoteEvent.name = noteName;
            newNoteEvent.type = vm.noteType.NOTE_ON;
            newNoteEvent.channel = 140; // this is channel midi channel 0
            newNoteEvent.midi = note.note;
            newNoteEvent.velocity = 127;
            newNoteEvent.createdAt = {
                seconds: performance.now(),
                tick: vm.$store.getters.getGlobalTickDelayed,
            };
            newNoteEvent.playAfter = {
                seconds: 0,
                tick: 0,
            };
            newNoteEvent.duration = null;
            vm.processUserNoteEvent(newNoteEvent);
        });

        // callback for when a laptop keyboard key is released
        keyboard.up(function(note) {
            const noteName = Midi.midiToNoteName(note.note, {sharps: true});
            const newNoteEvent = new NoteEvent();
            newNoteEvent.player = vm.playerType.HUMAN;
            newNoteEvent.instrument = vm.instrumentType.PIANO;
            newNoteEvent.eventSource = vm.eventSourceType.KEYBOARD;
            newNoteEvent.name = noteName;
            newNoteEvent.type = vm.noteType.NOTE_OFF;
            newNoteEvent.channel = 140; // this is channel midi channel 0
            newNoteEvent.midi = note.note;
            newNoteEvent.velocity = 127;
            newNoteEvent.createdAt = {
                seconds: performance.now(),
                tick: vm.$store.getters.getGlobalTickDelayed,
            };
            newNoteEvent.playAfter = {
                seconds: 0,
                tick: 0,
            };
            newNoteEvent.duration = null;

            vm.processUserNoteEvent(newNoteEvent);
        });

        
        vm.modelLoadTime = Date.now();
        console.log('TONE TONE TONE ', Tone.now());

        // Now set the permissionsGrated flag
        // It is true if  (permissionMIDI is true) AND (permissionAudio is true OR vm.config.interactionMode.audioMode is false)
        vm.permissionsGranted = vm.permissionMIDI && (vm.permissionAudio || !vm.config.interactionMode.audioMode);
        vm.displayPlayBtn();
    },
    methods: {

        // Clock behavior function.
        async tickBehavior() {
            const vm = this;
            if (vm.$store.getters.getClockStatus) {
                vm.$store.commit('incrementTick');

                // Trigger the metronome only if there is a "metronome" entry in config_players.yaml
                if (vm.config.players.metronome) {
                    vm.metronomeTrigger();
                }

                vm.calculateMaxBPM();

                // in grid-based mode, the agent's sampler is triggered in sync with the clock
                vm.triggerAgentSamplerSync(); // UNCOMMENT


                // run the agent with a small delay of tick/4 in order to include
                // any notes that the user played very close to the tick change.
                // this makes the grid a bit more flexible, and the human input is correctly parsed
                // In terms of playability, the human finds it much more easy to play
                // along the metronome on the grid
                // TUTOR: have a flag for that in config named delayedExecution
                if (vm.config.noteModeSettings.gridBased.status) {
                    if (vm.config.noteModeSettings.gridBased.delayedExecution) {
                        // console.log("delayedExecution");
                        vm.timeout_IDS_live.push(setTimeout(function() {
                            vm.estimateHumanQuantizedNote();
                            vm.runTheAgent();
                        }, parseInt(vm.$store.getters.getClockPeriod / 4)),
                        );
                    } else {
                        vm.estimateHumanQuantizedNote();
                        vm.runTheAgent();
                    }
                } else {
                    // inside runTheAgent we increment the "delayed" tick number.
                    // If we don't run the agent, we still want to increment the
                    // "delayed" tick number because other parts of the code
                    // depend on it. In this case tick === delayedTick
                    vm.$store.commit('incrementTickDelayed');
                }
            }
        },

        async toggleClock() {
            const vm = this;
            if (!vm.localSyncClockStatus) {
                vm.startRecording();
                vm.clockWorker.postMessage({action: 'startClock'});
            } else {
                vm.stopRecording();
                vm.clockWorker.postMessage({action: 'stopClock'});
            }
            vm.localSyncClockStatus = !vm.localSyncClockStatus;
            vm.$store.commit('changeClockStatus');
            vm.$store.commit('clearPianoState');
            // vm.manuallyUpdateData();
        },

        stopClock() {
            this.stopRecording();
            this.clockWorker.postMessage({action: 'stopClock'});
            this.localSyncClockStatus = false;
            this.$store.commit('setClockStatus', false);
            this.$store.commit('clearPianoState');
        },

        startClock() {
            this.startRecording();
            this.clockWorker.postMessage({action: 'startClock'});
            this.localSyncClockStatus = true;
            this.$store.commit('setClockStatus', true);
            this.$store.commit('clearPianoState');
        },

        metronomeTrigger() {
            const vm = this;
            // This method would trigger the metronome sampler.
            // getTicksPerBeat returns the number of ticks per beat
            // and we want the metronome to trigger every beat
            if (this.$store.getters.getLocalTick % this.$store.getters.getTicksPerBeat == 0) {
                const currentNote = this.$store.getters.getLocalTick %
                        this.$store.getters.getTicksPerMeasure === 0 ? 'G0' : 'C0';
                const metronomeNote = new NoteEvent();
                metronomeNote.player = vm.playerType.METRONOME;
                metronomeNote.name = currentNote;
                metronomeNote.type = vm.noteType.NOTE_ON;
                metronomeNote.velocity = 127;
                metronomeNote.playAfter = {
                    tick: 0,
                    seconds: 0,
                };
                this.$store.dispatch('samplerOn', metronomeNote);
            }
        },

        processUserNoteEvent(noteEvent, onScreenKeyboard = false) {
            // return 0;
            const vm = this;
            // We always send the user's input directly to the sampler
            // for immediate playback
            const whiteKey = noteEvent.name.includes('#') ? false : true;
            // Check if the current on-screen key is within the current screen view
            // if (this.$root.$refs.keyboard.$refs[noteEvent.name] )
            // is null then the key is not on screen
            const keyOnScreenRange = this.$root.$refs.keyboard.$refs[noteEvent.name] ? true : false;
            if (noteEvent.type == vm.noteType.NOTE_ON) {
                // console.log("note on");
                if (this.config.gui.pianoRoll.status && this.config.gui.pianoRoll.human) {
                    vm.$root.$refs.pianoRoll.keyDown(noteEvent);
                }
                vm.$store.dispatch('noteOn', noteEvent);
                vm.$store.dispatch('samplerOn', noteEvent);

                if (keyOnScreenRange && !onScreenKeyboard) {
                    if (whiteKey) {
                        this.$root.$refs.keyboard.$refs[noteEvent.name][0]
                            .classList.add('active-white-key-human');
                    } else {
                        this.$root.$refs.keyboard.$refs[noteEvent.name][0]
                            .classList.add('active-black-key-human');
                    }
                }
            } else if (noteEvent.type == vm.noteType.NOTE_OFF) {
                if (this.config.gui.pianoRoll.status && this.config.gui.pianoRoll.human) {
                    vm.$root.$refs.pianoRoll.keyUp(noteEvent);
                }
                vm.$store.dispatch('noteOff', noteEvent);
                vm.$store.dispatch('samplerOff', noteEvent);

                if (keyOnScreenRange && !onScreenKeyboard) {
                    if (whiteKey) {
                        this.$root.$refs.keyboard.$refs[noteEvent.name][0]
                            .classList.remove('active-white-key-human');
                    } else {
                        this.$root.$refs.keyboard.$refs[noteEvent.name][0]
                            .classList.remove('active-black-key-human');
                    }
                }
            }

            // If the clock is running, send the note to the piano roll
            if (vm.$store.getters.getClockStatus) {
                // If eventBased mode, send an NOTE_EVENT MICP packet to the agent
                // this packet will be sent to the processUserNoteEvent hook.
                if (vm.config.noteModeSettings.eventBased.status) {
                    vm.agent.postMessage({
                        hookType: vm.agentHookType.NOTE_EVENT,
                        content: noteEvent,
                    });
                }
            }
        },


        // TODO : change the name : agent, clock event, tick etc
        runTheAgent() {
            const vm = this;
            // console.log("runningTheagent");
            // remember, runTheAgent might happen with a small delay of tick/4 after the tick
            // here I just keep track of the 'delayed' tick
            this.$store.commit('incrementTickDelayed');

            // MAJOR TODO : draw should probably go before the delayedTickIncrement
            if (vm.config.gui.score.status) {
                this.$root.$refs.score.draw();
            }
            const messageContent = {
                tick: this.$store.getters.getLocalTick,
                globalTick: this.$store.getters.getGlobalTick,
            };
            if (vm.config.noteModeSettings.gridBased.eventBuffer) {
                messageContent['userNotes'] = this.$store.getters
                    .getMidiEventBuffer;
            }
            if (vm.config.noteModeSettings.gridBased.quantizedEvents) {
                messageContent['userQuantizedNotes'] = this.$store.getters
                    .getHumanInputFor(this.$store.getters.getLocalTick);
            }
            this.agent.postMessage({
                hookType: vm.agentHookType.CLOCK_EVENT,
                content: messageContent,
            });
        },

        estimateHumanQuantizedNote() {
            const vm = this;
            /*
                1) Get the raw continuous buffers for the current tick
                    (bufferOn, bufferOff, bufferEvent)
                2) preprocess them before quantization
                    a) In bufferEvent, we can remove the notes whose duration
                    is less than the tick duration
            */

            const bufferEvent = this.$store.getters.getMidiEventBuffer;
            // A this is the noteOff for a note from the previous
            // tick that was too short to be quantized
            if (vm.noteOffEventForNextTick) {
                bufferEvent.push(vm.noteOffEventForNextTick);
            }

            // console.log("bufferEvent", bufferEvent.length);
            // if (bufferEvent.length > 1) {
            //     console.log("bufferEvent", bufferEvent);
            // }
            // a COPY activePianoNotes are sorted by their "on" timestamp (newest to oldest)
            const activePianoNotes = [...this.$store.getters.getActivePianoNotes];
            const currentQuantizedEvents = [];

            // 2) preprocess them before quantization
            //     a) In bufferEvent, we can remove the notes whose
            //        duration is less than the tick duration
            // TODO : move this to utilities or smth
            let indexesToRemove = []; // the indexes of the events to be removed
            // for (let i = bufferEvent.length - 1; i >= 0; i--) {
            //     let elem = bufferEvent[i];
            //     if (elem.type === vm.noteType.NOTE_OFF) {
            //         const matchingIndexes = bufferEvent
            //             .map((e, i) => (e.type === vm.noteType.NOTE_ON &&
            //                              e.midi === elem.midi &&
            //                              e.createdAt.seconds < elem.createdAt.seconds) ? i : -1)
            //             .filter(index => index !== -1);
            //         if (matchingIndexes.length > 0) {
            //             indexesToRemove.push(i);
            //             indexesToRemove.push(Math.max(...matchingIndexes));
            //         }
            //     }
            // }
            let forgivenNoteOnIndex = -1;
            vm.noteOffEventForNextTick = null;
            for (let i = bufferEvent.length - 1; i >= 0; i--) {
                const elem = bufferEvent[i];
                if (elem.type === vm.noteType.NOTE_OFF) {
                    const matchingIndexes = bufferEvent
                        .map((e, i) => (e.type === vm.noteType.NOTE_ON &&
                            e.midi === elem.midi &&
                            e.createdAt.seconds < elem.createdAt.seconds) ? i : -1)
                        .filter((index) => index !== -1);
                    if (matchingIndexes.length > 0) {
                        indexesToRemove.push(i);
                        forgivenNoteOnIndex = Math.max(...matchingIndexes);
                        // indexesToRemove.push(Math.max(...matchingIndexes));
                    }
                }
            }

            indexesToRemove = Array.from(new Set([...indexesToRemove]));
            if (indexesToRemove.length > 0) {
                if (indexesToRemove.length > 1) {
                    console.warn('indexesToRemove', indexesToRemove);
                    // TODO : this can happen when playing a whole chord with duration
                    // less than the tick.
                }
                if (forgivenNoteOnIndex == -1) {
                    console.error('forgivenNoteOnIndex', forgivenNoteOnIndex);
                }
                vm.noteOffEventForNextTick = bufferEvent[indexesToRemove[0]];
                const forgivenNoteOn = bufferEvent[forgivenNoteOnIndex];

                activePianoNotes.push({
                    midi: forgivenNoteOn.midi,
                    createdAt: {
                        seconds: forgivenNoteOn.createdAt.seconds,
                        tick: forgivenNoteOn.createdAt.tick,
                    },
                });
            }

            const cleanedEventBuffer = bufferEvent.filter(
                (el, index) => !indexesToRemove.includes(index));
            // iterate over the active notes. If the note exists in the bufferEvent
            //  as an "on" event, then we have a note on
            // if the note does not exist in the bufferEvent, then we have a continuation
            // of the note (we assume it was activated in a previous tick)
            for (let i = 0; i < activePianoNotes.length; i++) {
                const midi = activePianoNotes[i].midi;
                const noteOnEvent = cleanedEventBuffer.find(
                    (elem) => elem.type === vm.noteType.NOTE_ON && elem.midi === midi);
                if (noteOnEvent) {
                    currentQuantizedEvents.push(noteOnEvent);
                } else {
                    const noteHoldEvent = new NoteEvent();
                    noteHoldEvent.type = vm.noteType.NOTE_HOLD;
                    noteHoldEvent.player = vm.playerType.HUMAN;
                    noteHoldEvent.midi = midi;

                    currentQuantizedEvents.push(noteHoldEvent);
                }
            }
            // console.log("currentQuantEvents", currentQuantizedEvents);
            // TODO : it seems I ignore rests. If no active notes,
            // then currentQuantizedEvents will be empty

            // now iterate over the bufferEvent and find all the noteOff notes
            // and push them to currentQuantizedEvents as off events
            // for (let i = 0; i < cleanedEventBuffer.length; i++) {
            //   const elem = cleanedEventBuffer[i];
            //   if (elem.type === "noteOff") {
            //     currentQuantizedEvents.push({
            //       type: "off",
            //       midi: elem.midi,
            //     })
            //   }
            // }

            // Due to the order we were pushing the events, the first elements
            // of currentQuantizedEvents are the "on",
            // then the "hold" and finally the "off". Also because activeNotes
            // are already sorted by their "noteOn" timestamp
            // the events in currentQuantizedEvents are also sorted by their original
            // "noteOn" timestamp

            // Now if we want we can constraint the polyphony. If polyphony = 3,
            // then we can only have 3 notes on at the same time
            // the way to do that is to keep at most the first 3 "on" or "hold"
            // events in currentQuantizedEvents and remove the rest "on" and "hold"

            // TODO : FOR NOW WE DON"T INCLUDE NOTE_OFF EVENTS IN THE QUANTIZED DATA.
            let constrainedCurrentQuantizedEvents = [];
            const onHoldEvents = currentQuantizedEvents.filter(
                (elem) => elem.type === vm.noteType.NOTE_ON || elem.type === vm.noteType.NOTE_HOLD);
            // let offEvents = currentQuantizedEvents.filter(elem => elem.type === "off");
            if (onHoldEvents.length > vm.config.noteModeSettings.gridBased.polyphony.input) {
                // let onHoldEventsToRemove = onHoldEvents.slice(polyphony);
                const onHoldEventsToKeep = onHoldEvents.
                    slice(0, vm.config.noteModeSettings.gridBased.polyphony.input);
                constrainedCurrentQuantizedEvents = [...onHoldEventsToKeep];
                // , ...offEventsToAdd, ...offEvents];
            } else {
                constrainedCurrentQuantizedEvents = [...currentQuantizedEvents];
            }
            // console.log("currentQuantEvents", currentQuantizedEvents);
            // console.log("CONSTRAINTQuantEvents", constrainedCurrentQuantizedEvents);
            // constrainedCurrentQuantizedEvents.forEach(elem => {
            //     console.log("type ", elem.type);
            // })
            this.$store.dispatch('storeUserQuantizedNotes', constrainedCurrentQuantizedEvents);

            this.$store.commit('clearContinuousBuffers');
            // TODO : for the future, keep a reference to the active notes of the previous tick
            // TODO : for more accuracy keep also a reference to the previous tick's quantized
            // notes and constrained quantized notes
            // TODO : and modify the logic accordingly.
        },

        agentParameterObserver() {
            const newParameterAgent = {index: null, value: null};
            if (this.paramReader.dequeue_change(newParameterAgent)) {
                this.dataForMonitoring[newParameterAgent.index] = newParameterAgent.value;
            }
        },

        triggerAgentSamplerSync() {
            const vm = this;
            const agentNotesToBePlayed = this.$store.getters.popAgentNotesToBePlayedAt(
                this.$store.getters.getGlobalTickDelayed,
            );
            if (this.config.gui.score.status) {
                // This guy here should update the lastNoteAI for the score to get
                // naively choose the first note only. ScoreUI only supports monophonic
                this.$store.dispatch('updateLastAgentNote', agentNotesToBePlayed);
            }
            if (agentNotesToBePlayed.length > 0) {
                agentNotesToBePlayed.forEach((noteEvent) => {
                    vm.processAgentNoteEvent(noteEvent);
                });
            } else {
                // console.log("no agent notes to be played");
            }
        },

        async agentCallback(e) {
            const vm = this;
            const hookType = parseInt(e.data.hookType);
            const message = e.data.message;
            // TODO move CLOCK_TIME and INFERENCE_TIME in the case/switch
            // TODO that will make those 2 optional in the agent hook.
            if (hookType == vm.agentHookType.CLOCK_EVENT) {
                // Look for the CLOCK_TIME and INFERENCE_TIME messages
                // The agent should always include two messages of type
                // CLOCK_TIME and INFERENCE_TIME
                // when posting from the CLOCK_EVENT hook (processClockEvent())
                const agentPredictionTick = e.data.message[vm.messageType.CLOCK_TIME];
                if ((agentPredictionTick !== this.$store.getters.getLocalTickDelayed)&&
                        (this.$store.getters.getGlobalTick > 2)) {
                    this.$toasted.show(
                        'Network tick misalignment: expecting ' +
                                    this.$store.getters.getLocalTickDelayed +
                                    ', got ' +
                                    agentPredictionTick,
                    );
                    this.misalignErrCount += 1;
                }
                const agentInferenceTime = e.data.message[vm.messageType.INFERENCE_TIME];
                vm.modelInferenceTimes.push(agentInferenceTime);
                // console.log("just pushed ", agentInferenceTime, " to modelInferenceTimes")
            }

            for (const messageTypeStr in message) {
                if (Object.hasOwn(message, messageTypeStr)) {
                    const messageValue = message[messageTypeStr];
                    const messageType = parseInt(messageTypeStr);

                    switch (messageType) {
                    case vm.messageType.STATUS:
                        if (messageValue == vm.statusType.SUCCESS) {
                            vm.agentLoaded = true;
                            vm.displayPlayBtn();
                            vm.modelLoadTime = Date.now() - vm.modelLoadTime;
                            // console.log('agent loaded');
                        }
                        break;
                    case vm.messageType.NOTE_LIST: {
                        const noteEventsList = messageValue;

                        const delayForNoteOn = 0.01;
                        const noteOffEvents = {}; // Store note_off events

                        noteEventsList.forEach((noteEventPlain) => {

                            // The noteEvents received from the agent are serialized
                            // we need to deserialize them before using them
                            const noteEvent = NoteEvent.fromPlain(noteEventPlain);

                            // A dirty hack to deal with tone.js weird behavior. check samplers.js
                            if (noteEvent.type === vm.noteType.NOTE_OFF) {
                                // Store note_off events by their note value
                                noteOffEvents[noteEvent.midi] = noteEvent;
                            } else if (noteEvent.type === vm.noteType.NOTE_ON) {
                                // Check if there's a corresponding note_off event
                                if (noteOffEvents[noteEvent.midi]) {
                                    if (noteOffEvents[noteEvent.midi].playAfter.tick === noteEvent.playAfter.tick &&
                                        noteOffEvents[noteEvent.midi].playAfter.seconds === noteEvent.playAfter.seconds)
                                    // Apply the tiny delay for note_on the note_on event
                                    noteEvent.playAfter.seconds += delayForNoteOn;
                                }
                            }
                            // End of hack

                            if (noteEvent.playAfter.tick > 0) {
                                // console.log("NAI NAI NAI NIA NIA NIA ");
                                this.$store.dispatch('storeAgentQuantizedOutput', noteEvent);
                            } else {
                                // console.log("type ", noteEvent.type, " ", noteEvent.midi);
                                vm.processAgentNoteEvent(noteEvent);
                            }
                        });
                        break;
                    }
                    // TODO ; make vector generic, not just for chroma vector
                    case vm.messageType.VECTOR:
                        if (this.audioAndChroma) {
                            this.$root.$refs.chromaChart.updateChromaData(messageValue);
                            // this.$root.$refs.vectorBar.updateVectorData(messageValue);
                        } else {
                            console.warn('The Agent generates chroma vectors but the Chroma' +
                            'Chart is not enabled in the config file');
                        }
                        break;
                    case vm.messageType.LABEL:
                        this.textBoxText = messageValue;
                        break;
                    case vm.messageType.TEXT:
                        if (hookType == vm.agentHookType.INIT_AGENT) {
                            const agentStatus = vm.$refs.agentStatus;
                            agentStatus.innerHTML = messageValue;
                        } else {
                            this.textBoxText = messageValue;
                        }
                        break;
                        // TODO :
                    case vm.messageType.CLOCK_TIME:
                        break;
                    case vm.messageType.INFERENCE_TIME:
                        break;
                    default:
                        console.log('Unknown message type: ', messageType);
                        break;
                    }
                }
            }
        },

        uiNoteOnAgent(noteEvent) {
            const vm = this;
            // set a timeout to call keyDown based on noteEvent.timestamp.seconds
            // TODO : the agent should do that
            const noteName = Midi.midiToNoteName(noteEvent.midi, {sharps: true});
            const whiteKey = noteName.includes('#') ? false : true;
            // Check if the current on-screen key is within the current screen view
            // if (this.$root.$refs.keyboard.$refs[noteEvent.name] ) is
            // null then the key is not on screen
            const keyOnScreenRange = this.$root.$refs.keyboard.$refs[noteName] ? true : false;
            // vm.timeout_IDS_kill.push(setTimeout(() => {
            //     // if (this.config.gui.pianoRoll.status)
            //     if (this.config.gui.pianoRoll.status && this.config.gui.pianoRoll.agent) {
            //         this.$root.$refs.pianoRoll.keyDown(noteEvent);
            //     }
            //     if (keyOnScreenRange) {
            //         if (whiteKey) {
            //             this.$root.$refs.keyboard.$refs[noteName][0].
            //                 classList.add('active-white-key-agent');
            //         } else {
            //             this.$root.$refs.keyboard.$refs[noteName][0].
            //                 classList.add('active-black-key-agent');
            //         }
            //     }
            // }, noteEvent.playAfter.seconds * 1000),
            // );
            vm.timeout_IDS_kill.push(setTimeout(() => {
                // if (this.config.gui.pianoRoll.status)
                if (vm.config.gui.pianoRoll.status && vm.config.gui.pianoRoll.agent) {
                    vm.$root.$refs.pianoRoll.keyDown(noteEvent);
                }
                if (keyOnScreenRange) {
                    if (whiteKey) {
                        vm.$root.$refs.keyboard.$refs[noteName][0].
                            classList.add('active-white-key-agent');
                    } else {
                        vm.$root.$refs.keyboard.$refs[noteName][0].
                            classList.add('active-black-key-agent');
                    }
                }
            }, noteEvent.playAfter.seconds * 1000),
            );
        },

        // TODO : refactor this one. choose which option
        // to use and remove the other one
        processAgentNoteEvent(noteEvent) {
            const vm = this;
            // The noteEvents that arrive here, have already
            //  waited for playAfter.tick ticks (if any)
            // so we can only care about playAfter.seconds here.
            if (noteEvent.type === vm.noteType.NOTE_ON) {
                // Here we check if this note has a defined duration.
                if (noteEvent.duration != null) {
                // Two ways to dealwith notes that have predefined duration.
                // 1) Create a matching NOTE_OFF event and schedule it to be played after 'duration'
                // 2) Use Tone.js triggerAttackRelease() api, which takes care of the NOTE_OFF event

                    if (noteEvent.duration.tick > 0) {
                        // ---------------- Second OPTION ----------------
                        if (vm.config.custom.useTriggerRelease) {
                            this.$store.dispatch('samplerOnOff', noteEvent);
                        // console.log("option2  ")
                        } else {
                            this.$store.dispatch('samplerOn', noteEvent);
                        // console.log("option1 ")
                        }
                        // else {
                        // If its duration is specified in ticks, then
                        // create a noteEvent with the same properties but type NOTE_OFF
                        // and modify its playAfter accordingly. Also set its duration to null
                        // so that it doesn't get processed again in this if statement
                        const noteEventOff = NoteEvent.copy(noteEvent);
                        noteEventOff.type = vm.noteType.NOTE_OFF;
                        noteEventOff.playAfter.tick = noteEvent.duration.tick;
                        noteEventOff.playAfter.seconds += noteEvent.duration.seconds;
                        noteEventOff.duration = null;
                        // An ugly hack to make the two options work together for now.
                        // Once we decide which option to use, we can remove this.
                        if (vm.config.custom.useTriggerRelease) {
                            noteEventOff.custom = true;
                        }
                        this.$store.dispatch('storeAgentQuantizedOutput', noteEventOff);
                        // }
                    } else if (noteEvent.duration.tick == 0) {
                        if (noteEvent.duration.seconds > 0) {
                            if (vm.config.custom.useTriggerRelease) {
                                // console.log("about to send samplerOnOff ", noteEvent.midi);
                                this.$store.dispatch('samplerOnOff', noteEvent);
                                // vm.timeout_IDS_live.push(setTimeout(() => {
                                //     this.uiNoteOffAgent(noteEvent);
                                // }, noteEvent.duration.seconds * 1000),
                                // );
                                vm.timeout_IDS_live.push(setTimeout(() => {
                                    vm.uiNoteOffAgent(noteEvent);
                                }, noteEvent.duration.seconds * 1000),
                                );

                                // console.log("option2  ")
                            } else {
                                this.$store.dispatch('samplerOn', noteEvent);
                                console.log('option1 ');
                                // TODO
                                // if I want option1 when duration is 0ticks and >0seconds
                                // I need to create a new noteOff event, and send it after >0seconds
                                // to a new method  that will call samplerOff and uiNoteOffAgent.
                                // For now, I just use option2
                                // vm.timeout_IDS_live.push(setTimeout(() => {
                                //     this.uiNoteOffAgent(noteEvent);
                                //     this.$store.dispatch('samplerOff', noteEvent);
                                // }, noteEvent.duration.seconds * 1000),
                                // );
                                vm.timeout_IDS_live.push(setTimeout(() => {
                                    vm.uiNoteOffAgent(noteEvent);
                                    vm.$store.dispatch('samplerOff', noteEvent);
                                }, noteEvent.duration.seconds * 1000),
                                );
                            }
                        } else {
                        // throw error, agent generated note with duration 0ticks and 0seconds
                            console.error('Agent generated note with' +
                            ' duration 0 ticks and 0 seconds');
                        }
                    }
                } else {
                    this.$store.dispatch('samplerOn', noteEvent);
                }
                // this.$store.dispatch("samplerOn", noteEvent);
                this.uiNoteOnAgent(noteEvent);
            } else if (noteEvent.type === vm.noteType.NOTE_OFF) {
                if (!noteEvent.hasOwnProperty('custom')) {
                    this.$store.dispatch('samplerOff', noteEvent);
                }
                // console.log("about to call uiNoteOffAgent");
                this.uiNoteOffAgent(noteEvent);
            } else if (noteEvent.type === vm.noteType.NOTE_HOLD) {
                console.log('HOLD event received from agent');
            }
        },

        uiNoteOffAgent(noteEvent) {
            const vm = this;
            // console.log("uiNoteOffAgent")
            // TODO : the agent should do that
            const noteName = Midi.midiToNoteName(noteEvent.midi, {sharps: true});
            // If '#' in noteName then whiteKey is false else true
            const whiteKey = noteName.includes('#') ? false : true;
            // Check if the current on-screen key is within the current screen view
            // if (this.$root.$refs.keyboard.$refs[noteEvent.name] )
            // is null then the key is not on screen
            const keyOnScreenRange = this.$root.$refs.keyboard.$refs[noteName] ? true : false;
            // set a timeout to call keyUp based on noteEvent.playAfter.seconds
            // vm.timeout_IDS_live.push(setTimeout(() => {
            //     if (keyOnScreenRange) {
            //         if (whiteKey) {
            //             // console.log("released white key ", noteName)
            //             this.$root.$refs.keyboard.$refs[noteName][0].
            //                 classList.remove('active-white-key-agent');
            //         } else {
            //             // console.log("released black key ", noteName)
            //             this.$root.$refs.keyboard.$refs[noteName][0].
            //                 classList.remove('active-black-key-agent');
            //         }
            //     }
            //     // if (this.config.gui.pianoRoll.status)
            //     if (this.config.gui.pianoRoll.status && this.config.gui.pianoRoll.agent) {
            //         this.$root.$refs.pianoRoll.keyUp(noteEvent);
            //     }
            // }, noteEvent.playAfter.seconds * 1000),
            // );
            vm.timeout_IDS_live.push(setTimeout(() => {
                if (keyOnScreenRange) {
                    if (whiteKey) {
                        // console.log("released white key ", noteName)
                        vm.$root.$refs.keyboard.$refs[noteName][0].
                            classList.remove('active-white-key-agent');
                    } else {
                        // console.log("released black key ", noteName)
                        vm.$root.$refs.keyboard.$refs[noteName][0].
                            classList.remove('active-black-key-agent');
                    }
                }
                // if (this.config.gui.pianoRoll.status)
                if (vm.config.gui.pianoRoll.status && vm.config.gui.pianoRoll.agent) {
                    vm.$root.$refs.pianoRoll.keyUp(noteEvent);
                }
            }, noteEvent.playAfter.seconds * 1000),
            );
        },

        /*
        * Web MIDI
        */
        async initializeMIDI() {
            try {
                const access = await navigator.requestMIDIAccess();
                this.WebMIDISupport = true;
                access.onstatechange = this.onEnabled;

                await WebMidi.enable();
                this.onEnabled();
            } catch (err) {
                console.error('WebMIDI Error:', err);
            }
        },
        onEnabled() {
            const vm = this;
            if (WebMidi.inputs.length < 1) {
                vm.activeDevices = [];
            } else {
                WebMidi.inputs.forEach((device) => {
                    vm.activeDevices.push({id: device.id, name: device.name});
                });
                this.selectedMIDIDevice = this.activeDevices[0].id;
                this.messageListener();
            }
        },

        onMIDIDeviceSelectedChange(state) {
            const vm = this;
            if (state.id) {
                if (vm.selectedMIDIDevice !== state.id) {
                    vm.selectedMIDIDevice = state.id;
                    vm.messageListener();
                }
            }
        },

        // listens for midi messages from a midi keyboard
        messageListener() {
            const vm = this;
            const inputDevice = WebMidi.getInputById(this.selectedMIDIDevice);
            inputDevice.addListener('noteon', (message) => {
                const newNoteEvent = new NoteEvent();
                newNoteEvent.player = vm.playerType.HUMAN;
                newNoteEvent.instrument = vm.instrumentType.PIANO;
                newNoteEvent.name = message.note.identifier;
                newNoteEvent.eventSource = vm.eventSourceType.MIDI_KEYBOARD;
                newNoteEvent.type = vm.noteType.NOTE_ON;
                newNoteEvent.channel = message.data[0];
                newNoteEvent.midi = message.data[1];
                newNoteEvent.velocity = message.data[2];
                newNoteEvent.createdAt = {
                    seconds: performance.now(), // message.timestamp
                    tick: vm.$store.getters.getGlobalTickDelayed,
                };
                newNoteEvent.playAfter = {
                    seconds: 0,
                    tick: 0,
                };
                newNoteEvent.duration = null;

                vm.processUserNoteEvent(newNoteEvent);
            });

            inputDevice.addListener('noteoff', (message) => {
                const newNoteEvent = new NoteEvent();
                newNoteEvent.player = vm.playerType.HUMAN;
                newNoteEvent.instrument = vm.instrumentType.PIANO;
                newNoteEvent.name = message.note.identifier;
                newNoteEvent.eventSource = vm.eventSourceType.MIDI_KEYBOARD;
                newNoteEvent.type = vm.noteType.NOTE_OFF;
                newNoteEvent.channel = message.data[0];
                newNoteEvent.midi = message.data[1];
                newNoteEvent.velocity = message.data[2];
                newNoteEvent.createdAt = {
                    seconds: performance.now(), // message.timestamp
                    tick: vm.$store.getters.getGlobalTickDelayed,
                };
                newNoteEvent.playAfter = {
                    seconds: 0,
                    tick: 0,
                };
                newNoteEvent.duration = null;

                vm.processUserNoteEvent(newNoteEvent);
            });
        },

        startRecording() {
            this.$store.commit('startUnMute');
        },

        stopRecording() {
            this.$store.commit('stopMute');
            // this is a nice hack
            let id = setTimeout(function() { }, 0);
            while (id--) {
                // check if id is in timeout_IDS_live. if not, then clear it
                if (this.timeout_IDS_kill.includes(id)) {
                // console.log("deleting timeout id " + id);
                    clearTimeout(id); // will do nothing if no timeout with id is present
                }
            }
            // this.timeout_IDS_kill.forEach((timeoutId) => {
            //   clearTimeout(timeoutId);
            // });
        },

        /*
        * Loading animation, switch between main content and loading welcome page.
        */
        entryProgram() {
            const vm = this;
            vm.$refs.mainLoadingScreen.classList.add('fade-out');
            vm.$refs.mainLoadingScreen.style.display = 'none';
            vm.$refs.mainContent.style.display = 'block';
            vm.$modal.show('introModal');
            console.log('TONE ENTRY ', Tone.now());
            if (vm.config.clockSettings.autoStart === true) {
                vm.toggleClock();
            }
        },

        displayPlayBtn() {
            console.log('in displayPlayBtn');
            if (this.agentLoaded && this.permissionsGranted) {
                const vm = this;
                // vm.$refs.entryBtn.classList.remove('fade-out');
                console.log('AAAAAAAAAAAAAAAAAAAAAAAA');
                vm.$refs.entryBtn.classList.add('fade-in');
                vm.$refs.entryBtn.style.visibility = 'visible';
            }
        },

        showSettingsModal() {
            this.$modal.show('settingsModal');
        },

        toggleMonitor() {
            // this.$root.$refs.mixerDat.guiMixer.hide();
            this.$root.$refs.monitor.pane.hidden = !this.$root.$refs.monitor.pane.hidden;
        },
        toggleMixer() {
            this.$root.$refs.mixer.pane.hidden = !this.$root.$refs.mixer.pane.hidden;
        },
        transposeOctUp() {
            this.keyboardoctaveStart += 1;
            this.keyboardoctaveEnd += 1;
        },

        transposeOctDown() {
            this.keyboardoctaveStart -= 1;
            this.keyboardoctaveEnd -= 1;
        },


        zoomInOct() {
        // ugly code to prevent the user from zooming in too much
            console.log('range before was ', this.keyboardoctaveEnd - this.keyboardoctaveStart);
            if (this.keyboardoctaveEnd - this.keyboardoctaveStart <= 1) {
                console.log('MIN was reched before');
                this.keyboardMinRangeDisplayed = true;
            } else {
                if (this.keyboardoctaveEnd - this.keyboardoctaveStart == 2) {
                    this.keyboardoctaveStart = Math.max(0, this.keyboardoctaveStart + 1);
                } else {
                    this.keyboardoctaveStart = Math.max(0, this.keyboardoctaveStart + 1);
                    this.keyboardoctaveEnd = Math.min(8, this.keyboardoctaveEnd - 1);
                }
                console.log('this.keyboardoctaveEnd - this.keyboardoctaveStart != 1');
                if (this.keyboardoctaveEnd - this.keyboardoctaveStart <= 1) {
                    console.log('MIN range reached');
                    this.keyboardMinRangeDisplayed = true;
                } else {
                    this.keyboardMinRangeDisplayed = false;
                }
            }
            this.keyboardMaxRangeDisplayed = false;
        },

        zoomOutOct() {
            console.log('range before was ', this.keyboardoctaveEnd - this.keyboardoctaveStart);
            if (this.keyboardoctaveEnd - this.keyboardoctaveStart >= 8) {
                console.log('MAX was reched before');
                this.keyboardMaxRangeDisplayed = true;
            } else {
                this.keyboardoctaveStart = Math.max(0, this.keyboardoctaveStart - 1);
                this.keyboardoctaveEnd = Math.min(8, this.keyboardoctaveEnd + 1);
                console.log('this.keyboardoctaveEnd - this.keyboardoctaveStart != 8');
                if (this.keyboardoctaveEnd - this.keyboardoctaveStart >= 8) {
                    console.log('MAX range reached');
                    this.keyboardMaxRangeDisplayed = true;
                } else {
                    this.keyboardMaxRangeDisplayed = false;
                }
            }
            this.keyboardMinRangeDisplayed = false;
        },

        modalCallback(eventName) {
            console.log('modal callback', eventName);
            this.$store.commit('changeModalStatus');
        },

        calculateMaxBPM() {
            const vm = this;
            const dt = vm.modelInferenceTimes.sort(function(a, b) {
                return a - b;
            })[Math.floor(vm.modelInferenceTimes.length * 0.95)];
            vm.maxBPM = Math.round(1000 * 60 / dt / vm.$store.getters.getTicksPerBeat);
        },

        bpmValueChanged(value) {
            console.log(value);
            this.localBPM = value;
            let revertToDefault = false;
            if (this.localSyncClockStatus) {
                this.stopClock();
            }
            revertToDefault = true;
            this.clockWorker.postMessage({action: 'setBPM', bpm: value});
            if (revertToDefault) {
                this.startClock();
            }
        },

        buttonAction(buttonId) {
            // use paramWriter to write a parameter to the agent
            const buttonPropertyName = `BUTTON_${buttonId}`;
            if (this.paramWriter != null &&
                    !this.paramWriter.enqueue_change(
                        this.uiParameterType[buttonPropertyName], 1.0)) {
                console.warn('Couldn\'t enqueue.');
            }
        },

        handleMixerUpdate(event) {
            this.$store.commit('handleMixerUpdate', event);
        },

        manuallyUpdateMixer(event) {
            this.mixer_data = event;
            console.log('Main got mixer update', event);
        },

        manuallyUpdateData() {
            const vm = this;
            for (const [player, playerData] of Object.entries(vm.mixer_data)) {
                console.log('player', player);
                for (const [instId, instData] of Object.entries(playerData.instruments)) {
                    console.log('instId', instId);
                    const changeEvent = {
                        playerId: player,
                        instrumentId: instId,
                        what: 'volume',
                        value: instData.volume,
                    };
                    vm.handleMixerUpdate(changeEvent);
                };
            }
        },
    },

    computed: {
        // This copies the switches array to computedSwitches
        // so that we can watch() the computedSwitches while
        // havin access to the old switches array.
        // https://github.com/vuejs/vue/issues/2164
        computedSwitches: function() {
            return this.switches.map((a) => {
                return {...a};
            });
        },

        computedSliders: function() {
            return this.sliders.map((a) => {
                return {...a};
            });
        },
        audioAndMeter: function() {
            return this.config.gui.audioMeter.status && this.config.interactionMode.audioMode;
        },
        audioAndChroma: function() {
            return this.config.gui.chromaChart.status && this.config.interactionMode.audioMode;
        },
        showMonitor: function() {
            if (this.config.gui.monitor) {
                if (this.config.gui.monitor.status) {
                    return true;
                }
            }
            return false;
        },
    },

    watch: {
        misalignErrCount: {
            immediate: true,
            handler(newValue) {
                if (newValue == 10) {
                    this.$toasted.show(
                        'Your machine cannot run inference at this speed. Try lowering the BPM.',
                    );
                }
            },
        },

        keyboardoctaveStart: {
            immediate: true,
            handler(newValue) {
                // A trick, to force keyboard re-render itself.
                this.keyboardKey += 1;
            },
        },

        localBPM: {
            immediate: true,
            handler(newValue) {
                console.log('localBPM changed to ', newValue);
                this.$store.commit('setBPM', newValue);
            },
        },

        computedSwitches: {
        // immediate: true,
            deep: true,
            handler(newStates, oldStates) {
                newStates.forEach((newState, index) => {
                    const oldStatus = oldStates.length == 0 ? null : oldStates[index].status;
                    if (newState.status !== oldStatus) {
                        const floatStatus = newState.status ? 1.0 : 0.0;
                        const switchPropertyName = `SWITCH_${index + 1}`;
                        if (
                            this.paramWriter != null &&
                                            !this.paramWriter.enqueue_change(
                                                this.uiParameterType[switchPropertyName],
                                                floatStatus,
                                            )
                        ) {
                            console.warn('Couldn\'t enqueue.');
                        }
                    }
                });
            },
        },

        computedSliders: {
            // immediate: true,
            deep: true,
            handler(newStates, oldStates) {
                newStates.forEach((newState, index) => {
                    const oldStatus = oldStates.length == 0 ? null : oldStates[index].status;
                    if (newState.value !== oldStatus) {
                        // let floatStatus = newState.status ? 1.0 : 0.0;
                        const sliderPropertyName = `SLIDER_${index + 1}`;
                        console.log('detected ', sliderPropertyName, ' change to ', newState.value);
                        if (
                            this.paramWriter != null &&
                                            !this.paramWriter.enqueue_change(
                                                this.uiParameterType[sliderPropertyName],
                                                newState.value,
                                            )
                        ) {
                            console.warn('Couldn\'t enqueue.');
                        }
                    }
                });
            },
        },
    },
};

</script>

<template>
    <!-- main.vue, the application's main UI file.-->
    <div>
        <div ref="mainLoadingScreen" id="mainLoadingScreen">
            <div id="loadingScreenInjection" class="center">
                <h1 class="loadingTitle">
                    {{ config.title }}
                </h1>
                <h3 class="loadingSubtitle"> {{ config.subtitle }}</h3>
                <p ref="agentStatus" class="loadingStatus">
                    Loading the Agent...
                </p>
                <div id="entryBtnContainer" style="width:100%;height:60px;">
                    <button @click="entryProgram" ref="entryBtn"
                        class="entryBtn" style="visibility: hidden;">
                        <span style="width:100%;text-align:center;">Play</span>
                    </button>
                </div>
                <p v-if="isNotChrome">
                    We highly recommend using Chrome for better user experience.
                </p>
                <p v-if="isMobile">
                    The model may not perform normally on mobile devices. We recommend
                    using Desktop computers.
                </p>
            </div>
        </div>
        <div ref="mainContent" id="mainContent"
            style="justify-content: center; align-items: center;">

            <modal class="test" draggable=".window-header" name="introModal"
                :adaptive="true"
                :width="800"
                :height="600"
                :minWidth="500"
                :minHeight="100"
                :resizable="true"
                :scrollable="true"
                @opened="modalCallback"
                @closed="modalCallback">
                <div class="babyParent">
                    <div class="window-header">
                        <p class="modalTitle">
                            Introduction
                        </p>
                    </div>
                    <markdown-it-vue class="mdClass" :content="intro_text_content" />
                </div>

            </modal>

            <SettingsModal
                :switches="switches"
                :sliders="sliders"
                :buttons="buttons"
                :maxBPM="maxBPM"
                :initBPM="localBPM"
                :WebMIDISupport="WebMIDISupport"
                @button-click="buttonAction"
                @midi-device-change="onMIDIDeviceSelectedChange"
                @bpm-change="bpmValueChanged"
            ></SettingsModal>

            <!-- <div v-if="config.gui.pianoRoll.status"> -->
                <PianoRoll :show="config.gui.pianoRoll.status" id="pianoRoll" />
            <!-- </div> -->


            <!-- v-if="config.gui.keyboard.status" -->
            <Keyboard id="pianoKeyboard" class="pianoKeyboard" ref="keyboard" :key="keyboardKey"
                :octave-start="keyboardoctaveStart" :octave-end="keyboardoctaveEnd" />

            <Mixer @newEventSignal="handleMixerUpdate" />

            <div v-if="showMonitor">
                <Monitor :dataFromParent="dataForMonitoring" />
            </div>
            <div v-if="config.gui.score.status">
                <Score :scrollStatus="scrollStatus"/>
            </div>"

            <div v-if="audioAndChroma">
                <ChromaChart/>
            </div>

            <div v-if="textBoxStatus">
                <TextBox :height=100 :width=180 :title="textBoxTitle" :text="textBoxText"
                    style="position: absolute; bottom: 300px; right: 20px; z-index:8" />
            </div>
                style="position: absolute; bottom: 300px; right: 20px; z-index:8" />
            <div v-if="audioAndMeter">
                <AudioMeter ref="audioMeter" :width=300 :height="100"
                    :fft_bins="128" orientation="top"
                    style="position:absolute; z-index:0;
                    top:0px; left:0px; background-color:transparent" />
            </div>

            <!-- <VectorBar ref="vectorBar" :width=300 :height="100"
                    :num_bars="12" orientation="top"
                    style="position:absolute; z-index:0; top:0px;
                        right:0px; background-color:transparent" /> -->


            <!-- On-screen buttons -->
            <div style="position: absolute; bottom: 230px; right: 11px">
                <md-button class="controlBtn" @click="toggleClock" style="width: 40px">
                    <md-icon>{{ localSyncClockStatus ? "pause" : "play_arrow" }}</md-icon>
                </md-button>
                <md-button class="controlBtn" @click="showSettingsModal">
                    <md-icon>settings</md-icon>
                </md-button>
                <md-button class="controlBtn" @click="toggleMixer">
                    <md-icon>tune</md-icon>
                </md-button>
                <md-button v-if="showMonitor" class="controlBtn" @click="toggleMonitor">
                    <i class="material-symbols-outlined">monitoring</i>
                </md-button>
            </div>

            <md-button v-if="keyboardoctaveEnd !== 8"
                @click="transposeOctUp" class="md-icon-button md-raised"
                style="position: absolute; right: 20px; bottom: 100px">
                <md-icon>arrow_forward</md-icon>
            </md-button>
            <md-button v-if="keyboardoctaveStart !== 0"
                @click="transposeOctDown" class="md-icon-button md-raised"
                style="position: absolute; left: 20px; bottom: 100px">
                <md-icon>arrow_back</md-icon>
            </md-button>
            <md-button v-if="!keyboardMinRangeDisplayed"
                @click="zoomInOct" class="md-icon-button md-raised"
                style="position: absolute; right: 20px; bottom: 50px">
                <!-- <md-icon>arrow_forward</md-icon> -->
                <i class="material-symbols-outlined">zoom_in</i>
            </md-button>
            <md-button v-if="!keyboardMaxRangeDisplayed"
                @click="zoomOutOct" class="md-icon-button md-raised"
                style="position: absolute; left: 20px; bottom: 50px">
                <!-- <md-icon>arrow_forward</md-icon> -->
                <i class="material-symbols-outlined">zoom_out</i>
            </md-button>
        </div>
    </div>
</template>

<style>
@media (min-width: 1024px) {
    .main {
        min-height: 100vh;
        display: flex;
        align-items: center;
    }
}</style>
