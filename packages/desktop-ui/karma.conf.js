// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['jasmine', '@angular-devkit/build-angular'],
        plugins: [
            require('karma-jasmine'),
            require('karma-chrome-launcher'),
            require('@angular-devkit/build-angular/plugins/karma'),
        ],
        reporters: ['progress'],
        browsers: ['ChromeHeadlessNoSandbox'],
        customLaunchers: {
            // --no-sandbox is required in CI containers
            ChromeHeadlessNoSandbox: { base: 'ChromeHeadless', flags: ['--no-sandbox'] },
        },
        singleRun: true,
        restartOnFileChange: false,
    });
};
