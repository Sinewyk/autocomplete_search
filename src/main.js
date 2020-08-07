"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var xstream_1 = require("xstream");
var run_1 = require("@cycle/run");
var dom_1 = require("@cycle/dom");
var JSONP_1 = require("@cycle/JSONP");
var time_1 = require("@cycle/time");
var state_1 = require("@cycle/state");
var app_1 = require("./app");
function preventDefaultSinkDriver(prevented$) {
    prevented$.addListener({
        next: function (ev) {
            ev.preventDefault();
            if (ev.type === "blur") {
                ev.target.focus();
            }
        },
        error: function () { },
        complete: function () { },
    });
    return xstream_1.default.empty();
}
var wrappedMain = state_1.withState(app_1.default);
run_1.run(wrappedMain, {
    DOM: dom_1.makeDOMDriver("#main-container"),
    JSONP: JSONP_1.makeJSONPDriver(),
    preventDefault: preventDefaultSinkDriver,
    Time: time_1.timeDriver,
});
