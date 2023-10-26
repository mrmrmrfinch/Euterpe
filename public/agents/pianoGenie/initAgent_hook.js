/**
 * This file contains variable initializations as well as 
 * the first set of hook functions that are invoked by 
 * the UI to initialize the agent.
 */

/* Variable initialization */

/**
 * NOTE: 
 * - Global variables shared between the agent.js and the hooks
 *   need to be declared using the self keyword
 * - Local variables can be declared using the let keyword (or const)
 *
 * You should also initialize the Agent parameters that are controllable
 * by UI elements. Those UI elements are defined in config_widgets.yaml
 * under the settingsModal section.
 *
 * You can change their names to match your agent's parameters,
 * e.g.: slider1 --> randomness, 
 *      switch1 --> arpeggioType
 *      e.t.c
 */


// Global ui-parameters shared with the other hooks and the agent.js
self.temperature = 0.25;
self.bypass = 0;

// Neural Network related variables
self.genie = null;
const totalNotes = 88; 
self.keyWhitelist = Array(totalNotes).fill().map((x,i) => {
    return i;
});
const GENIE_CHECKPOINT = 'https://storage.googleapis.com/magentadata/js/checkpoints/piano_genie/model/epiano/stp_iq_auto_contour_dt_166006'; 

/**
 * This function is invoked every time there is a change in the UI parameters.
 * This is where the mapping of the UI widgets to the worker parameters happens.
 * Following the examples above, you can change the code below like this:
 * switch (newUpdate.index) {
 *     case self.uiParameterType.SLIDER_1:
 *         self.slider1 = newUpdate.value;
 *         break;
 *     case self.uiParameterType.SWITCH_1:
 *         self.switch1 = newUpdate.value;
 *         break;
 *     case self.uiParameterType.BUTTON_1:
 *         // call the reset function
 *         resetAgent();
 *         break;
 *
 * NOTE: The number that comes after 'self.uiParameterType.SLIDER_', 
 * 'self.uiParameterType.SWITCH_' or 'self.uiParameterType.BUTTON_' 
 * should match the id of the sliders, switches, and buttons
 * defined in config_widgets.yaml.
 *
 * Again, feel free to delete the 'cases' you don't use.
 *
 * @param {object} newUpdate - An object containing information about the UI parameter update.
 */
export function updateParameter(newUpdate){
    
    switch(newUpdate.index){
        case self.uiParameterType.SLIDER_1:
            self.temperature = newUpdate.value;
            console.log("temperature is " + self.temperature);
            break;
        case self.uiParameterType.SWITCH_1:
            self.bypass = newUpdate.value;
            console.log("bypass is " + self.bypass);
            break;
        default:
            console.warn("Invalid parameter type");
            break;
    }
}

/**
 * If you have any external JSON files, you can load them here.
 * 
 */
export async function loadExternalFiles() {
    // For example:
    // await fetch('extraData.json').then(response => {
    //     return response.json();
    // }).then(data => {
    //     self.externalData = data;
    // }); 
}

/**
 * In this hook, you can load/initialize your core algorithm/model.
 * For example, if your agent is a neural network, you can load the model here.
 * 
 * This is also a good place to warm up your model if needed.
 * Don't forget to send messages to the UI to let it know of the progress. Those 
 * progress messages will be shown in the intro screen while the agent is loading.
 * 
 */
export async function loadAlgorithm(content) {
    
    tf.setBackend('webgl');
    try {
        self.genie = new piano_genie.PianoGenie(GENIE_CHECKPOINT);
        await self.genie.initialize();
    } catch (error) {
        console.error(error);
    }
    
    // Optional message for the Euterpe/UI
    postMessage({
        hookType: self.agentHookType.INIT_AGENT,
        message:{
            [self.messageType.STATUS]: 
                    self.statusType.LOADED,
            [self.messageType.TEXT]: 
                    "Checkpoint is loaded",
        },
    })

    // Warm up the model
    let inferenceTimes = [];
    for (let i = 0; i < self.config.agentSettings.warmupRounds; i++) {
        let start = performance.now();

        let note = self.genie.nextFromKeyList(0, keyWhitelist, self.temperature/100);

        let inferenceTime = performance.now() - start;
        inferenceTimes.push(inferenceTime);
        console.log(inferenceTime);
        // you can sent WARMUP status messages to the UI if you want.
        // these will appear in the intro screen
        postMessage({
            hookType: self.agentHookType.INIT_AGENT,
            message:{
                [self.messageType.STATUS]: 
                        self.statusType.WARMUP,
                [self.messageType.TEXT]: 
                        "PianoGenie is warming up. Current round: " + (i + 1) + "/" + self.config.agentSettings.warmupRounds,
            },
        })
    }
    self.genie.resetState();

    console.log("Average inference time: " + inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length);
    
    // Once your model/agent is ready to play, 
    // UI expects a success message, don't forget to send it.
    postMessage({
        hookType: self.agentHookType.INIT_AGENT,
        message:{
            [self.messageType.STATUS]: 
                    self.statusType.SUCCESS,
            [self.messageType.TEXT]: 
                    "PianoGenie is ready to interact with you!",
        },
    })
}

