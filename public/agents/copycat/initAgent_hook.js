/*
    First, you should set the Agent parameters that are controllable
    by UI elements. Those UI elements are defined in config_widgets.yaml
    under the settingsModal section.

    You should change their names to match your worker's parameters,
    e.g. slider1 --> gain, slider2 --> randomness etc
         switch1 --> arpeggioType

    Currently you can use up to 4 sliders and 4 switches.
    You can delete the ones you don't need.

    NOTE: You should use the 'self' keyword to define the parameters
        e.g. self.gain = 0.5;
        that way, they will be accessible from the other hooks and the agent.js
*/
self.randomness = 0.0;

/*
    This function is invoked every time there is a change in the UI parameters. 
    This is where the mapping of the UI widgets to the worker parameters happens
    Following the exmaples above you can change the code below like this:
    switch(newUpdate.index){
        case self.uiParameterType.SLIDER_1:
            self.gain = newUpdate.value;
            break;
        case self.uiParameterType.SLIDER_2:
            self.randomness = newUpdate.value;
            break;
        case self.uiParameterType.SWITCH_1:
            self.arpeggioType = newUpdate.value;
            break;

    NOTE: The number that comes after 'self.uiParameterType.SLIDER_' or 'self.uiParameterType.SWITCH_'
          need to match the id of the sliders and switches defined in config_widgets.yaml

    Again, feel free to delete the 'cases' you don't use. 
*/
function updateParameter(newUpdate){
    
    switch(newUpdate.index){
        case self.uiParameterType.SLIDER_1:
            self.randomness = newUpdate.value;
            break;
        default:
            console.warn("Invalid parameter type");
            break;
    }
}

/*
    If you have any external JSON files, you can load them here. 
    For exmaple :

    await fetch('extraData.json').then(response => {
        return response.json();
    }).then(data => {
        self.extraData = data;
    });
    
    You can always import external *js files using importScripts()
    at the top of agent.js
*/
async function loadExternalFiles(content) {
    // Put your code here
}

/*
    In this hook, you can load/initialize your core algorithm/model.
    For example, if your agent is a neural network, you can load the model here.
    
    This is also a good place to warm up your model, if needed.
    Don't forget to send messages to the UI to let it know of the progress. Those 
    progress messages will be shown in the intro screen while the agent is loading.
*/
async function loadAlgorithm(content) {
    
    // A simple example of loading a model with tensorflow.js : 
    // tf.setBackend('webgl');
    // try {
    //     self.model = await tf.loadLayersModel('Checkpoints/model.json');
    // } catch (error) {
    //     console.error(error);
    // }
    // const mvae = new mm.music_vae.MusicVAE('https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small');
    // await mvae.initialize();
    // self.genie = new piano_genie.PianoGenie(GENIE_CHECKPOINT);
    // await self.genie.initialize();

    // Warm up the model if needed
    
    postMessage({
        hookType: self.agentHookType.INIT_AGENT,
        message:{
            [self.messageType.STATUS]: 
                    self.statusType.LOADED,
            [self.messageType.TEXT]: 
                    "Core algorithm is loaded",
        },
    })
    
    // Once your model/agent is ready to play, 
    // UI expects a success message, don't forget to send it.
    postMessage({
        hookType: self.agentHookType.INIT_AGENT,
        message:{
            [self.messageType.STATUS]: 
                    self.statusType.SUCCESS,
            [self.messageType.TEXT]: 
                    "The Agent is ready to interact with you!",
        },
    })
}

export { updateParameter, loadAlgorithm, loadExternalFiles};