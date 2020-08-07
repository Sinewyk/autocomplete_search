"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
var xstream_1 = require("xstream");
var debounce_1 = require("xstream/extra/debounce");
var dropUntil_1 = require("xstream/extra/dropUntil");
var dom_1 = require("@cycle/dom");
var immutable_1 = require("immutable");
var containerStyle = {
    background: "#EFEFEF",
    padding: "5px",
};
var sectionStyle = {
    marginBottom: "10px",
};
var searchLabelStyle = {
    display: "inline-block",
    width: "100px",
    textAlign: "right",
};
var comboBoxStyle = {
    position: "relative",
    display: "inline-block",
    width: "300px",
};
var inputTextStyle = {
    padding: "5px",
};
var autocompleteableStyle = __assign(__assign({}, inputTextStyle), {
    width: "100%",
    boxSizing: "border-box",
});
var autocompleteMenuStyle = {
    position: "absolute",
    left: "0px",
    right: "0px",
    top: "25px",
    zIndex: "999",
    listStyle: "none",
    backgroundColor: "white",
    margin: "0",
    padding: "0",
    borderTop: "1px solid #ccc",
    borderLeft: "1px solid #ccc",
    borderRight: "1px solid #ccc",
    boxSizing: "border-box",
    boxShadow: "0px 4px 4px rgb(220,220,220)",
    userSelect: "none",
    "-moz-box-sizing": "border-box",
    "-webkit-box-sizing": "border-box",
    "-webkit-user-select": "none",
    "-moz-user-select": "none",
};
var autocompleteItemStyle = {
    cursor: "pointer",
    listStyle: "none",
    padding: "3px 0 3px 8px",
    margin: "0",
    borderBottom: "1px solid #ccc",
};
var LIGHT_GREEN = "#8FE8B4";
/**
 * source: --a--b----c----d---e-f--g----h---i--j-----
 * first:  -------F------------------F---------------
 * second: -----------------S-----------------S------
 *                         between
 * output: ----------c----d-------------h---i--------
 */
function between(first, second) {
    return function (source) { return first.mapTo(source.endWhen(second)).flatten(); };
}
/**
 * source: --a--b----c----d---e-f--g----h---i--j-----
 * first:  -------F------------------F---------------
 * second: -----------------S-----------------S------
 *                       notBetween
 * output: --a--b-------------e-f--g-----------j-----
 */
function notBetween(first, second) {
    return function (source) {
        return xstream_1.default.merge(source.endWhen(first), first.map(function () { return source.compose(dropUntil_1.default(second)); }).flatten());
    };
}
function intent(domSource, timeSource) {
    var UP_KEYCODE = 38;
    var DOWN_KEYCODE = 40;
    var ENTER_KEYCODE = 13;
    var TAB_KEYCODE = 9;
    var input$ = domSource.select(".autocompleteable").events("input");
    var keydown$ = domSource.select(".autocompleteable").events("keydown");
    var itemHover$ = domSource
        .select(".autocomplete-item")
        .events("mouseenter");
    var itemMouseDown$ = domSource
        .select(".autocomplete-item")
        .events("mousedown");
    var itemMouseUp$ = domSource.select(".autocomplete-item").events("mouseup");
    var inputFocus$ = domSource.select(".autocompleteable").events("focus");
    var inputBlur$ = domSource.select(".autocompleteable").events("blur");
    var itemDelete$ = domSource.select(".result-item-delete").events("mouseup");
    var enterPressed$ = keydown$.filter(function (_a) {
        var keyCode = _a.keyCode;
        return keyCode === ENTER_KEYCODE;
    });
    var tabPressed$ = keydown$.filter(function (_a) {
        var keyCode = _a.keyCode;
        return keyCode === TAB_KEYCODE;
    });
    var clearField$ = input$.filter(function (ev) { return ev.target.value.length === 0; });
    var inputBlurToItem$ = inputBlur$.compose(between(itemMouseDown$, itemMouseUp$));
    var inputBlurToElsewhere$ = inputBlur$.compose(notBetween(itemMouseDown$, itemMouseUp$));
    var itemMouseClick$ = itemMouseDown$
        .map(function (down) { return itemMouseUp$.filter(function (up) { return down.target === up.target; }); })
        .flatten();
    return {
        search$: input$
            .compose(timeSource.debounce(500))
            .compose(between(inputFocus$, inputBlur$))
            .map(function (ev) { return ev.target.value; })
            .filter(function (query) { return query.length > 0; }),
        moveHighlight$: keydown$
            .map(function (_a) {
            var keyCode = _a.keyCode;
            switch (keyCode) {
                case UP_KEYCODE:
                    return -1;
                case DOWN_KEYCODE:
                    return +1;
                default:
                    return 0;
            }
        })
            .filter(function (delta) { return delta !== 0; }),
        setHighlight$: itemHover$.map(function (ev) { return parseInt(ev.target.dataset.index); }),
        deleteResult$: itemDelete$.map(function (ev) { return parseInt(ev.target.dataset.index); }),
        keepFocusOnInput$: xstream_1.default.merge(inputBlurToItem$, enterPressed$, tabPressed$),
        selectHighlighted$: xstream_1.default
            .merge(itemMouseClick$, enterPressed$, tabPressed$)
            .compose(debounce_1.default(1)),
        wantsSuggestions$: xstream_1.default.merge(inputFocus$.mapTo(true), inputBlur$.mapTo(false)),
        quitAutocomplete$: xstream_1.default.merge(clearField$, inputBlurToElsewhere$),
    };
}
function reducers(suggestionsFromResponse$, actions) {
    var moveHighlightReducer$ = actions.moveHighlight$.map(function (delta) {
        return function moveHighlightReducer(state) {
            var suggestions = state.get("suggestions");
            var wrapAround = function (x) { return (x + suggestions.length) % suggestions.length; };
            return state.update("highlighted", function (highlighted) {
                if (highlighted === null) {
                    return wrapAround(Math.min(delta, 0));
                }
                else {
                    return wrapAround(highlighted + delta);
                }
            });
        };
    });
    var setHighlightReducer$ = actions.setHighlight$.map(function (highlighted) {
        return function setHighlightReducer(state) {
            return state.set("highlighted", highlighted);
        };
    });
    var selectHighlightedReducer$ = actions.selectHighlighted$
        .mapTo(xstream_1.default.of(true, false))
        .flatten()
        .map(function (selected) {
        return function selectHighlightedReducer(state) {
            var suggestions = state.get("suggestions");
            var highlighted = state.get("highlighted");
            var kept = state.get("kept");
            var hasHighlight = highlighted !== null;
            var isMenuEmpty = suggestions.length === 0;
            if (selected && hasHighlight && !isMenuEmpty) {
                return state
                    .set("selected", suggestions[highlighted])
                    .set("suggestions", [])
                    .set("kept", __spreadArrays(kept, [suggestions[highlighted]]));
            }
            else {
                return state.set("selected", null);
            }
        };
    });
    var hideReducer$ = actions.quitAutocomplete$.mapTo(function hideReducer(state) {
        return state.set("suggestions", []);
    });
    var suggestionsReducer$ = actions.wantsSuggestions$
        .map(function (accepted) {
        return suggestionsFromResponse$.map(function (suggestions) {
            return accepted ? suggestions : [];
        });
    })
        .flatten()
        .map(function (suggestions) { return function (state) { return state.set("suggestions", suggestions); }; });
    var deleteResultReducer$ = actions.deleteResult$.map(function (indexToDelete) { return function (state) {
        var kept = state.get("kept");
        return state.set("kept", __spreadArrays(kept.slice(0, indexToDelete), kept.slice(indexToDelete + 1)));
    }; });
    return xstream_1.default.merge(moveHighlightReducer$, setHighlightReducer$, selectHighlightedReducer$, hideReducer$, suggestionsReducer$, deleteResultReducer$);
}
function renderAutocompleteMenu(_a) {
    var suggestions = _a.suggestions, highlighted = _a.highlighted;
    if (suggestions.length === 0) {
        return dom_1.ul();
    }
    var childStyle = function (index) { return (__assign(__assign({}, autocompleteItemStyle), {
        backgroundColor: highlighted === index ? LIGHT_GREEN : null,
    })); };
    return dom_1.ul(".autocomplete-menu", { style: autocompleteMenuStyle }, suggestions.map(function (suggestion, index) {
        return dom_1.li(".autocomplete-item", { style: childStyle(index), attrs: { "data-index": index } }, suggestion);
    }));
}
function renderComboBox(_a) {
    var suggestions = _a.suggestions, highlighted = _a.highlighted, selected = _a.selected;
    return dom_1.span(".combo-box", { style: comboBoxStyle }, [
        dom_1.input(".autocompleteable", {
            style: autocompleteableStyle,
            attrs: { type: "text" },
            hook: {
                update: function (old, _a) {
                    var elm = _a.elm;
                    if (selected !== null) {
                        elm.value = selected;
                    }
                },
            },
        }),
        renderAutocompleteMenu({ suggestions: suggestions, highlighted: highlighted }),
    ]);
}
function renderResults(_a) {
    var kept = _a.kept;
    return dom_1.ul(".results-list", kept.map(function (result, index) {
        return dom_1.li(".result-item", [
            dom_1.button(".result-item-delete", { attrs: { "data-index": index } }, "❌"),
            " ",
            result,
        ]);
    }));
}
function view(state$) {
    return state$.map(function (state) {
        var suggestions = state.get("suggestions");
        var highlighted = state.get("highlighted");
        var selected = state.get("selected");
        var kept = state.get("kept");
        return dom_1.div(".container", { style: containerStyle }, [
            dom_1.section({ style: sectionStyle }, [
                dom_1.label(".search-label", { style: searchLabelStyle }, "Query:"),
                renderComboBox({ suggestions: suggestions, highlighted: highlighted, selected: selected }),
            ]),
            dom_1.section({ style: sectionStyle }, [
                dom_1.label(".results-label", "Results:"),
                renderResults({ kept: kept }),
            ]),
        ]);
    });
}
var BASE_URL = "https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=";
var networking = {
    processResponses: function (JSONP) {
        return JSONP.filter(function (res$) { return res$.request.indexOf(BASE_URL) === 0; })
            .flatten()
            .map(function (res) { return res[1]; });
    },
    generateRequests: function (searchQuery$) {
        return searchQuery$.map(function (q) { return BASE_URL + encodeURI(q); });
    },
};
function preventedEvents(actions, state$) {
    return state$
        .map(function (state) {
        return actions.keepFocusOnInput$.map(function (event) {
            if (state.get("suggestions").length > 0 &&
                state.get("highlighted") !== null) {
                return event;
            }
            else {
                return null;
            }
        });
    })
        .flatten()
        .filter(function (ev) { return ev !== null; });
}
function app(sources) {
    var state$ = sources.state.stream;
    var suggestionsFromResponse$ = networking.processResponses(sources.JSONP);
    var actions = intent(sources.DOM, sources.Time);
    var reducer$ = reducers(suggestionsFromResponse$, actions);
    var vtree$ = view(state$);
    var prevented$ = preventedEvents(actions, state$);
    var searchRequest$ = networking.generateRequests(actions.search$);
    return {
        DOM: vtree$,
        preventDefault: prevented$,
        JSONP: searchRequest$,
        state: xstream_1.default.merge(xstream_1.default.of(function () {
            return immutable_1.Map({
                suggestions: [],
                kept: [],
                highlighted: null,
                selected: null,
            });
        }), reducer$),
    };
}
exports.default = app;
