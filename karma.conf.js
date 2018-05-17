module.exports = function(config) {
    config.set({
        frameworks: [
            'mocha'
        ],
        plugins: [
            'karma-mocha'
        ],
        files: [
            'test/*.js'
        ]
    });
};
