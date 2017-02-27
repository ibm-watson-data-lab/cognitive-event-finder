var app = new Vue({
    el: '#events',
    data: {
        events: []
    },
    methods: {
        init() {
            app.events= events;
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();
