var app = new Vue({
    el: '#events',
    data: {
        events: null
    },
    methods: {
        init() {
            this.events = events;
            var points = [];
            var point;
            for (var i=0; i<this.events.length; i++) {
                point = this.events[i];
                if (point.geometry) {
                    if (!point.type) {
                        point.type = "Feature";
                    }
                    points.push({type: point.type, geometry: point.geometry});
                }
            }
            L.mapbox.accessToken = mapboxAccessToken;
            var map = L.mapbox.map('map', 'mapbox.light').setView([30.26715, -97.74306], 14);
            L.mapbox.featureLayer().setGeoJSON(points).addTo(map);
            map.scrollWheelZoom.disable();
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();