import Vue from 'vue';
import store from './store/index.js';
import App from './App.vue';
import router from './router';
import Vue2TouchEvents from 'vue2-touch-events';
import ToggleButton from 'vue-js-toggle-button';
import VModal from 'vue-js-modal';
import Toasted from 'vue-toasted';
import {MdButton, MdIcon, MdField} from 'vue-material/dist/components';
import 'vue-material/dist/vue-material.min.css';
import 'vue-material/dist/theme/default.css';
import 'remixicon/fonts/remixicon.css';
import Dropdown from 'vue-simple-search-dropdown';
import MarkdownItVue from 'markdown-it-vue'

Vue.use(MdButton);
Vue.use(MdIcon);
Vue.use(MdField);
Vue.use(Dropdown);
Vue.use(VModal,  { dynamicDefault: { draggable: true, resizable: true } });
Vue.use(MarkdownItVue);
Vue.use(Toasted, {
    duration: 1000,
});
Vue.use(ToggleButton);
Vue.use(Vue2TouchEvents, {
    disableClick: true,
    touchClass: '',
    tapTolerance: 10,
    touchHoldTolerance: 400,
    swipeTolerance: 30,
    longTapTimeInterval: 400,
    namespace: 'touch',
});
Vue.config.productionTip = false;

new Vue({
    router,
    store,
    render: (h) => h(App),
}).$mount('#app');
