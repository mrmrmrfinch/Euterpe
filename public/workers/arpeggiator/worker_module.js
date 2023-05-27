// If needed, you can import any external libraries here (e.g., tensorflow.js, onnx, magenta, etc.)
// This module version of the worker is a better option, and allows to use essentia.js
// however, it's impossible to use tfjs or magenta.js

import * as utils from "../../utils.js"
import Meyda from 'https://cdn.jsdelivr.net/npm/meyda@5.6.0/+esm'
import * as rb from 'https://cdn.jsdelivr.net/npm/ringbuf.js@0.3.3/+esm'
import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';


// importScripts("https://cdn.jsdelivr.net/npm/@magenta/music@^1.23.1/es6/core.js");
// importScripts("https://cdn.jsdelivr.net/npm/@magenta/music@^1.23.1/es6/music_rnn.js");
// importScripts("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");
// Import tensorflow using 'import' syntax from https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js
// import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.6.0/dist/tf.min.js';
// import * as tf  from "../../libraries/tfjs/tf.min.js";
// import tfjs from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.6.0/dist/tf.es2017.min.js';

let config = null;
let messageType = null;
let statusType = null;
let noteType = null;
let parameterType = null;
// Audio related variables
let pcm = null;
let channelCount = null;
let sampleRate = null;
let staging = null;
let _audio_reader = null;
let audio_frames_queue = null;
let frames = null;
let windowSize = null;
let hopSize = null;
let sampleCounter = null;
let currentFrame = null;
let frameCounter = null;

let newParameter = null;
let slider1 = null;
let slider2 = null;
let slider3 = null;
let slider4 = null;
let button1 = null;
let button2 = null;
let button3 = null;
let button4 = null;
let switch1 = null;
let switch2 = null;
let switch3 = null;
let switch4 = null;


// Read some float32 pcm from the queue, convert to int16 pcm, and push it to
// our global queue.
function readFromQueue() {
    const samples_read = self._audio_reader.dequeue(self.staging);
    // console.log("staestaging", Date.now());
    if (!samples_read) {
      return 0;
    }
    // samples_read can have less length than staging
    const segment = new Int16Array(samples_read);
    for (let i = 0; i < samples_read; i++) {
      segment[i] = Math.min(Math.max(self.staging[i], -1.0), 1.0) * (2 << 14 - 1);
      if (self.sampleCounter == self.windowSize - 1){
        self.audio_frames_queue.push(self.currentFrame);
        let tempFrame = new Float32Array(self.windowSize);
        // Copy the last windowSize - hopSize samples to the current frame
        // to the beginning of the new frame
        for (let j = 0; j < (self.windowSize - self.hopSize); j++){
            tempFrame[j] = self.currentFrame[j + self.hopSize];
        }
        self.currentFrame = tempFrame;
        self.sampleCounter = self.windowSize - self.hopSize;
      }
        self.currentFrame[self.sampleCounter] = self.staging[i];
        self.sampleCounter += 1;
        
    //   self.local_audio_buffer.push(self.staging[i]);
    }
    self.pcm.push(segment);
    return samples_read;
}

function updateParameter(newUpdate){

    // use switch instead
    switch(newUpdate.index){
        case self.parameterType.SLIDER_1:
            self.slider1 = newUpdate.value;
            break;
        case self.parameterType.SLIDER_2:
            self.slider2 = newUpdate.value;
            break;
        case self.parameterType.SLIDER_3:
            self.slider3 = newUpdate.value;
            break;
        case self.parameterType.SLIDER_4:
            self.slider4 = newUpdate.value;
            break;
        case self.parameterType.BUTTON_1:
            self.button1 = newUpdate.value;
            break;
        case self.parameterType.BUTTON_2:
            self.button2 = newUpdate.value;
            break;
        case self.parameterType.BUTTON_3:
            self.button3 = newUpdate.value;
            break;
        case self.parameterType.BUTTON_4:
            self.button4 = newUpdate.value;
            break;
        case self.parameterType.SWITCH_1:
            self.switch1 = newUpdate.value;
            break;
        case self.parameterType.SWITCH_2:
            self.switch2 = newUpdate.value;
            break;
        case self.parameterType.SWITCH_3:
            self.switch3 = newUpdate.value;
            break;
        case self.parameterType.SWITCH_4:
            self.switch4 = newUpdate.value;
            break;
        default:
            console.log("Invalid parameter type");
            break;
    }
}

// Hook that takes the config.yaml from the UI.
async function loadConfig(content) {
    self.config = content.config;
    self.noteType = content.noteType;
    self.statusType = content.statusType;
    self.messageType = content.messageType;
    self.parameterType = content.parameterType;
    self.ticksPerMeasure = self.config.clockBasedSettings.ticksPerBeat * 
                            self.config.clockBasedSettings.timeSignature.numerator;
    // If you have any external JSON files, you can load them here
    //     await fetch('extraData.json').then(response => {
    //         return response.json();
    //     }).then(data => {
    //         self.extraData = data;
    //     });
}

// Hook that accepts the sharedArrayBuffer from the UI that stores audio samples
async function initAudio(content){
    console.log(content)
    self._audio_reader = new rb.AudioReader(
        new rb.RingBuffer(content.sab, Float32Array)
    );
    self._param_reader = new rb.ParameterReader(
        new rb.RingBuffer(content.sab_par, Uint8Array)
    );

    self.newParameter = { index: null, value: null };

    // The number of channels of the audio stream read from the queue.
    self.channelCount = content.channelCount;
    // The sample-rate of the audio stream read from the queue.
    self.sampleRate = content.sampleRate;

    // Store the audio data, segment by segments, as array of int16 samples.
    self.pcm = [];

    // The frame/window size
    self.windowSize = 1024 * self.channelCount;
    // The hop size
    self.hopSize = 256 * self.channelCount;

    // Audio Frames per clock tick
    self.framesPerTick = self.sampleRate * self.channelCount * 60 / 
                         60 / // self.config.clockBasedSettings.tempo
                        self.hopSize / 
                        self.config.clockBasedSettings.ticksPerBeat;

    // Store the audio data, as an array of frames
    // each frame is as array of float32 samples.
    // the size of the frame is equal to windowSize
    // This will be used in the AUDIO_BUFFER hook to
    // to feed the audio frames to the worker's music interaction algorithm.
    // We use a LIFOQueue to store the frames, so that we can efficiently
    // push and pop frames from the queue.
    // We set the max size of the queue to the equivalent duration of 16 clock ticks
    self.audio_frames_queue = new utils.LIFOQueue(16 * self.framesPerTick);

    
    
    // the current frame/window array. We'll keep pushing samples to it
    // untill it's full (windowSize samples). Then we'll push it to the
    // audio_frames_queue and start a new frame/window.
    self.currentFrame = new Float32Array(self.windowSize);

    // This counter will be used to keep track of the number of samples
    // we have pushed to the current frame/window.
    self.sampleCounter = 0

    // A smaller staging array to copy the audio samples from, before conversion
    // to uint16. It's size is 4 times less than the 1 second worth of data
    // that the ring buffer can hold, so it's 250ms, allowing to not make
    // deadlines:
    // staging buffer size = ring buffer byteLengthsize / sizeof(float32) /4 / 2?
    self.staging = new Float32Array(content.sab.byteLength / 4 / 4 / 2);

    // Initialize Essentia.js
    // EssentiaWASM().then(async function(WasmModule) {
    
    //     // self.essentiaExtractor = new EssentiaExtractor(WasmModule);
    //     // console.log("essentia version: " + essentiaExtractor.version)
    //     console.log("WasmModule: " + WasmModule);
    //   });
    Meyda.bufferSize = self.windowSize;
    console.log("MEYDA: " + Meyda.bufferSize);
    console.log("staging buffer size: " + self.staging.length + " samples");
    console.log("sab byteLength: " + content.sab.byteLength + " bytes");    

    // console.log("essentia", essentiaJs);
    // console.log(Object.keys(Essentia));
    const essentia = new Essentia(EssentiaWASM);
    console.log("essentia", essentia);

    // tf.setBackend('webgl');
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 1, inputShape: [1]}));
    console.log("model", model);

    // console.log("essen extractor", essentiaJsExtractor.EssentiaExtractor);
    // console.log("essen wasm", essentiaJsWasm);
    // essentiaJs.EssentiaWASM().then(function(essentiaWasmModule) {
    //     let essentiaExtractor = new essentiaJsExtractor.EssentiaExtractor(essentiaWasmModule);
    //     // settings specific to an algorithm
    //       // essentiaExtractor.profile.HPCP.nonLinear = true;
    //                 // modifying default extractor settings
    //     //   essentiaExtractor.frameSize = bufferSize;
    //     //   essentiaExtractor.hopSize = hopSize;
    //     //   essentiaExtractor.sampleRate = audioCtx.sampleRate;
    //     //   essentiaExtractor.profile.HPCP.normalized = 'none';
    //     //   essentiaExtractor.profile.HPCP.harmonics = 0;
    //     console.log('profile changed')
    //     });

    // Attempt to dequeue every 100ms. Making this deadline isn't critical:
    // there's 1 second worth of space in the queue, and we'll be dequeing
    self.interval = setInterval(readFromQueue, 100);
}

// Hook that loads and prepares the algorithm
async function loadAlgorithm() {

    // Load/initialize your algorithm/model here
    // const sess = new ort.InferenceSession();
    // const ortWasm = new OrtWasm.OrtWasmThreaded();

    // The UI expects a LOADED status message.
    postMessage({
        messageType: self.messageType.STATUS,
        statusType: self.statusType.LOADED,
        content: "Worker is loaded!",
    });

    // If your model/worker/algorithm needs to be warmed up, do it here
    for (let i = 0; i < self.config.workerSettings.warmupRounds; i++) {

        // you can sent WARMUP status messages to the UI if you want.
        postMessage({
            messageType: self.messageType.STATUS,
            statusType: self.statusType.WARMUP,
            content: "Worker is warming up. Current round: " + (i + 1) + "/" + self.config.workerSettings.warmupRounds,
        });
    }

    // Once your model/worker is ready to play, 
    // UI expects a success message
    postMessage({
        messageType: self.messageType.STATUS,
        statusType: self.statusType.SUCCESS,
        content: "Worker is ready to interact with you!",
    });

}

// Hook for processing note/MIDI events from the user.
// This hook is called in sync with the clock, and provides
// 1) a buffer with all the raw events since the last clock tick
// 2) a list of all the quantized events for the current tick
async function processClockEvent(content) {
    

    if (self._param_reader.dequeue_change(self.newParameter)) {
        console.log("param index: " + self.newParameter.index + " value: " + self.newParameter.value);
        updateParameter(self.newParameter);
    }

    let latestAudioFrame = self.audio_frames_queue.pop()
    let channel1 = new Float32Array(latestAudioFrame.length / self.channelCount);
    let channel2 = new Float32Array(latestAudioFrame.length / self.channelCount);
    let channels = [channel1, channel2];
    utils.deinterleave_custom(latestAudioFrame, channels, self.channelCount);

    // let meydaBuffer = Meyda.buffer(1024)
    // console.log("meydaBuffer: " + meydaBuffer);
    let audioChroma = Meyda.extract(['rms', 'loudness', 'chroma'], channels[0]);
    // console.log("features: " + audioChroma.rms + "    " + audioChroma.loudness.total);
    // workerAudio.postMessage(audioChroma);

    

    var predictTime = performance.now();
    utils.simulateBlockingOperation(40);


    // The list of notes to be sent to the UI
    let noteList = [];

    const currentTick = content.tick;
    const humanQUantizedInput = content.humanQuantizedInput;
    
    if (content.reset) {
        // If the user clicks the reset button, you can
        // reset your algorithm here
    }
    
    // An example of the Note object the UI expects
    // const note = {
    //     player: "worker",
    //     instrument: "piano",
    //     name: null, 
    //     // Note type can be NOTE_ON, NOTE_OFF, NOTE_HOLD, REST
    //     type: self.noteType.NOTE_ON,
    //     // a number 0-127. 128 is a rest
    //     midi: 60,
    //     // a number 0-11. 12 is a rest
    //     chroma: 0,
    //     // a number 0-127
    //     velocity: 127, 
    //     timestamp: {
    //         // note was generated at this tick
    //         tick: currentTick, 
    //         //Tone.now() // note was generated at this time (seconds)
    //         seconds: null,
    //     },
    //     // When to play the note. Ticks and seconds are added together
    //     playAfter: {
    //         // play the note at the next tick
    //         tick: 1,
    //         // add extra delay to the note (seconds)
    //         seconds: 0
    //     }
    // }
    // noteList.push(note);

    // estimate the inference time of your algorithm
    // the UI keeps track of this, and will warn the user
    // if the inference time higher than the clock's period
    predictTime = performance.now() - predictTime;
    // console.log("predictTime: " + predictTime)
    // The MICP package the UI expects.
    postMessage({
        messageType: self.messageType.CLOCK_EVENT,
        content: {
            predictTime: predictTime,
            tick: currentTick,
            events: noteList,
        }
    });
}

// Hook for processing the audioBuffer received from the main thread
// This hook is called every Fs/buffer_size seconds
async function processAudioBuffer(content){
    // console.log("raw_audio", content);
}

// Hook for processing single note events.
// This hook is called every time a note is played
async function processNoteEvent(content){
    // content is a midiEvent object
    let noteList = [];

    /* An example of a simple MIDI processor
     * take the user's input and create an arpeggio
     * the arpeggio should be 4, 8, 12, 16, 8, 4, 0 above the user's input
     * and every note played with a delay of 0.1 seconds from the previous note
     */
    let arpeggio = [3, 5, 8, 12];
    // if this a not off event, add an extra 0.1 sec offset
    let extraSecOffset = content.type == self.noteType.NOTE_OFF ? 0.1 : 0.0;
    for (let i = 0; i < arpeggio.length; i++) {
        // console.log("i", i, "type", content.type, "midi", content.midi, "arp", arpeggio[i])
        let arp_note = {
            player: "worker",
            instrument: "piano",
            name: null,
            type: content.type,
            midi: content.midi + arpeggio[i],
            chroma: null,
            velocity: 127/(i+3),
            playAfter: {
                tick: 0,
                seconds: 0.05 * (i+1) ,//+ extraSecOffset
            },
            // timestamp: {
            //     tick: 0,
            //     seconds: content.timestamp.seconds + 0.1 * (i+1)
            // }
        }
        noteList.push(arp_note);
    }

    console.log(self.audio_frames_queue.length());

    postMessage({
        messageType: self.messageType.NOTE_EVENT,
        content: {
            // predictTime: predictTime,
            // tick: currentTick,
            events: noteList,
        }
    });
}

async function prepareWAV(){
    clearInterval(self.interval);
    // Drain the ring buffer
    while (readFromQueue()) {
    /* empty */
    }
    // Structure of a wav file, with a byte offset for the values to modify:
    // sample-rate, channel count, block align.
    const CHANNEL_OFFSET = 22;
    const SAMPLE_RATE_OFFSET = 24;
    const BLOCK_ALIGN_OFFSET = 32;
    const header = [
    // RIFF header
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    // fmt chunk. We always write 16-bit samples.
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0x10, 0x00,
    // data chunk
    0x64, 0x61, 0x74, 0x61, 0xfe, 0xff, 0xff, 0x7f,
    ];
    // Find final size: size of the header + number of samples * channel count
    // * 2 because pcm16
    let size = header.length;
    for (let i = 0; i < self.pcm.length; i++) {
    size += self.pcm[i].length * 2;
    }
    const wav = new Uint8Array(size);
    const view = new DataView(wav.buffer);

    // Copy the header, and modify the values: note that RIFF
    // is little-endian, we need to pass `true` as the last param.
    for (let i = 0; i < wav.length; i++) {
    wav[i] = header[i];
    }

    console.log(
    `Writing wav file: ${self.sampleRate}Hz, ${self.channelCount} channels, int16`
    );

    view.setUint16(CHANNEL_OFFSET, self.channelCount, true);
    view.setUint32(SAMPLE_RATE_OFFSET, self.sampleRate, true);
    view.setUint16(BLOCK_ALIGN_OFFSET, self.channelCount * 2, true);

    // Finally, copy each segment in order as int16, and transfer the array
    // back to the main thread for download.
    let writeIndex = header.length;
    for (let segment = 0; segment < self.pcm.length; segment++) {
    for (let sample = 0; sample < self.pcm[segment].length; sample++) {
        view.setInt16(writeIndex, self.pcm[segment][sample], true);
        writeIndex += 2;
    }
    }
    // postMessage(wav.buffer, [wav.buffer]);
    postMessage({
        messageType: self.messageType.WAV_BUFFER,
        content: wav.buffer
    }, [wav.buffer]);

}
// Hook selector based on the MICP packet type
async function onMessageFunction (obj) {
    if (self.config == null) {
        loadConfig(obj.data.content);
        // make sure that the config is loaded
        if (self.config == null) {
            return;
        }
    } else {
        if (obj.data.messageType == self.messageType.CLOCK_EVENT) {
            await processClockEvent(obj.data.content);
        } else if (obj.data.messageType == self.messageType.LOAD_ALGORITHM) {
            await loadAlgorithm();
        // } else if (obj.data.messageType == self.messageType.LOAD_CONFIG) {
        //     await self.loadConfig(obj.data.content);
        } else if (obj.data.messageType == self.messageType.INIT_AUDIO) {
            await initAudio(obj.data.content);
        } else if (obj.data.messageType == self.messageType.AUDIO_BUFFER) {
            await processAudioBuffer(obj.data.content);
        } else if (obj.data.messageType == self.messageType.NOTE_EVENT){
            await processNoteEvent(obj.data.content);
        } else if (obj.data.messageType == self.messageType.PREPARE_WAV){
            await prepareWAV();
        }
    }
}

onmessage = onMessageFunction;