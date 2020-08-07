import xs, { Stream } from "xstream";
import { Reducer, StateSource } from "@cycle/state";
import debounce from "xstream/extra/debounce";
import dropUntil from "xstream/extra/dropUntil";
import {
	ul,
	li,
	span,
	input,
	div,
	section,
	label,
	button,
	MainDOMSource,
} from "@cycle/dom";
import { Map as ImmutableMap } from "immutable";

import { TimeSource } from "@cycle/time";
import { ResponseStream } from "@cycle/JSONP";

type Sources = {
	DOM: MainDOMSource;
	state: StateSource<any>;
	Time: TimeSource;
	JSONP: Stream<ResponseStream>;
};

const containerStyle = {
	background: "#EFEFEF",
	padding: "5px",
};

const sectionStyle = {
	marginBottom: "10px",
};

const searchLabelStyle = {
	display: "inline-block",
	width: "100px",
	textAlign: "right",
};

const comboBoxStyle = {
	position: "relative",
	display: "inline-block",
	width: "300px",
};

const inputTextStyle = {
	padding: "5px",
};

const autocompleteableStyle = {
	...inputTextStyle,
	...{
		width: "100%",
		boxSizing: "border-box",
	},
};

const autocompleteMenuStyle = {
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

const autocompleteItemStyle = {
	cursor: "pointer",
	listStyle: "none",
	padding: "3px 0 3px 8px",
	margin: "0",
	borderBottom: "1px solid #ccc",
};

const LIGHT_GREEN = "#8FE8B4";

/**
 * source: --a--b----c----d---e-f--g----h---i--j-----
 * first:  -------F------------------F---------------
 * second: -----------------S-----------------S------
 *                         between
 * output: ----------c----d-------------h---i--------
 */
function between<T>(first: Stream<any>, second: Stream<any>) {
	return (source: Stream<T>): Stream<T> =>
		first.mapTo(source.endWhen(second)).flatten();
}

/**
 * source: --a--b----c----d---e-f--g----h---i--j-----
 * first:  -------F------------------F---------------
 * second: -----------------S-----------------S------
 *                       notBetween
 * output: --a--b-------------e-f--g-----------j-----
 */
function notBetween<T>(first: Stream<any>, second: Stream<any>) {
	return (source: Stream<T>): Stream<T> =>
		xs.merge(
			source.endWhen(first),
			first.map(() => source.compose(dropUntil(second))).flatten()
		);
}

interface Actions {
	search$: Stream<string>;
	moveHighlight$: Stream<0 | 1 | -1>;
	setHighlight$: Stream<number>;
	deleteResult$: Stream<number>;
	keepFocusOnInput$: Stream<FocusEvent | KeyboardEvent>;
	selectHighlighted$: Stream<any>;
	wantsSuggestions$: Stream<boolean>;
	quitAutocomplete$: Stream<any>;
}

function intent(domSource: MainDOMSource, timeSource: TimeSource): Actions {
	const UP_KEYCODE = 38;
	const DOWN_KEYCODE = 40;
	const ENTER_KEYCODE = 13;
	const TAB_KEYCODE = 9;

	const input$ = (domSource
		.select(".autocompleteable")
		.events("input") as unknown) as Stream<InputEvent>;
	const keydown$ = domSource.select(".autocompleteable").events("keydown");
	const itemHover$ = domSource
		.select(".autocomplete-item")
		.events("mouseenter");
	const itemMouseDown$ = domSource
		.select(".autocomplete-item")
		.events("mousedown");
	const itemMouseUp$ = domSource.select(".autocomplete-item").events("mouseup");
	const inputFocus$ = domSource.select(".autocompleteable").events("focus");
	const inputBlur$ = domSource.select(".autocompleteable").events("blur");

	const itemDelete$ = domSource.select(".result-item-delete").events("mouseup");

	const enterPressed$ = keydown$.filter(
		({ keyCode }) => keyCode === ENTER_KEYCODE
	);
	const tabPressed$ = keydown$.filter(({ keyCode }) => keyCode === TAB_KEYCODE);
	const clearField$ = input$.filter(
		(ev) => (ev?.target as HTMLInputElement)?.value.length === 0
	);
	const inputBlurToItem$ = inputBlur$.compose(
		between(itemMouseDown$, itemMouseUp$)
	);
	const inputBlurToElsewhere$ = inputBlur$.compose(
		notBetween(itemMouseDown$, itemMouseUp$)
	);
	const itemMouseClick$ = itemMouseDown$
		.map((down) => itemMouseUp$.filter((up) => down.target === up.target))
		.flatten();

	return {
		search$: input$
			.compose(timeSource.debounce(500))
			.compose(between(inputFocus$, inputBlur$))
			.map((ev) => (ev?.target as HTMLInputElement)?.value)
			.filter((query) => query.length > 0),
		moveHighlight$: keydown$
			.map(({ keyCode }) => {
				switch (keyCode) {
					case UP_KEYCODE:
						return -1;
					case DOWN_KEYCODE:
						return +1;
					default:
						return 0;
				}
			})
			.filter((delta) => delta !== 0),
		setHighlight$: itemHover$.map((ev) =>
			parseInt((ev?.target as any)?.dataset.index)
		),
		deleteResult$: itemDelete$.map((ev) =>
			parseInt((ev?.target as any)?.dataset.index)
		),
		keepFocusOnInput$: xs.merge(inputBlurToItem$, enterPressed$, tabPressed$),
		selectHighlighted$: xs
			.merge(itemMouseClick$, enterPressed$, tabPressed$)
			.compose(debounce(1)),
		wantsSuggestions$: xs.merge(
			inputFocus$.mapTo(true),
			inputBlur$.mapTo(false)
		),
		quitAutocomplete$: xs.merge(clearField$, inputBlurToElsewhere$),
	};
}

function reducers(
	suggestionsFromResponse$: Stream<string[]>,
	actions: Actions
): Stream<Reducer<any>> {
	const moveHighlightReducer$ = actions.moveHighlight$.map(
		(delta) =>
			function moveHighlightReducer(state) {
				const suggestions = state.get("suggestions");
				const wrapAround = (x: number) =>
					(x + suggestions.length) % suggestions.length;
				return state.update("highlighted", (highlighted: number | null) => {
					if (highlighted === null) {
						return wrapAround(Math.min(delta, 0));
					} else {
						return wrapAround(highlighted + delta);
					}
				});
			}
	);

	const setHighlightReducer$ = actions.setHighlight$.map(
		(highlighted) =>
			function setHighlightReducer(state) {
				return state.set("highlighted", highlighted);
			}
	);

	const selectHighlightedReducer$ = actions.selectHighlighted$
		.mapTo(xs.of(true, false))
		.flatten()
		.map(
			(selected) =>
				function selectHighlightedReducer(state) {
					const suggestions = state.get("suggestions");
					const highlighted = state.get("highlighted");
					const kept = state.get("kept");
					const hasHighlight = highlighted !== null;
					const isMenuEmpty = suggestions.length === 0;
					if (selected && hasHighlight && !isMenuEmpty) {
						return state
							.set("selected", suggestions[highlighted])
							.set("suggestions", [])
							.set("kept", [...kept, suggestions[highlighted]]);
					} else {
						return state.set("selected", null);
					}
				}
		);

	const hideReducer$ = actions.quitAutocomplete$.mapTo(function hideReducer(
		state
	) {
		return state.set("suggestions", []);
	});

	const suggestionsReducer$ = actions.wantsSuggestions$
		.map((accepted) =>
			suggestionsFromResponse$.map((suggestions) =>
				accepted ? suggestions : []
			)
		)
		.flatten()
		.map((suggestions) => (state) => state.set("suggestions", suggestions));

	const deleteResultReducer$ = actions.deleteResult$.map(
		(indexToDelete) => (state) => {
			const kept = state.get("kept");
			return state.set("kept", [
				...kept.slice(0, indexToDelete),
				...kept.slice(indexToDelete + 1),
			]);
		}
	);

	return xs.merge(
		moveHighlightReducer$,
		setHighlightReducer$,
		selectHighlightedReducer$,
		hideReducer$,
		suggestionsReducer$,
		deleteResultReducer$
	);
}

function renderAutocompleteMenu({
	suggestions,
	highlighted,
}: {
	suggestions: string[];
	highlighted: number | null;
}) {
	if (suggestions.length === 0) {
		return ul();
	}
	const childStyle = (index: number) => ({
		...autocompleteItemStyle,
		...{
			backgroundColor: highlighted === index ? LIGHT_GREEN : null,
		},
	});

	return ul(
		".autocomplete-menu",
		{ style: autocompleteMenuStyle },
		suggestions.map((suggestion, index) =>
			li(
				".autocomplete-item",
				{ style: childStyle(index), attrs: { "data-index": index } },
				suggestion
			)
		)
	);
}

function renderComboBox({
	suggestions,
	highlighted,
	selected,
}: {
	suggestions: string[];
	highlighted: number | null;
	selected: number | null;
}) {
	return span(".combo-box", { style: comboBoxStyle }, [
		input(".autocompleteable", {
			style: autocompleteableStyle,
			attrs: { type: "text" },
			hook: {
				update: (old: unknown, { elm }: { elm: HTMLInputElement }) => {
					if (selected !== null) {
						elm.value = (selected as unknown) as string;
					}
				},
			},
		}),
		renderAutocompleteMenu({ suggestions, highlighted }),
	]);
}

function renderResults({ kept }) {
	return ul(
		".results-list",
		kept.map((result, index) =>
			li(".result-item", [
				button(".result-item-delete", { attrs: { "data-index": index } }, "❌"),
				" ",
				result,
			])
		)
	);
}

function view(state$) {
	return state$.map((state) => {
		const suggestions = state.get("suggestions");
		const highlighted = state.get("highlighted");
		const selected = state.get("selected");
		const kept = state.get("kept");
		return div(".container", { style: containerStyle }, [
			section({ style: sectionStyle }, [
				label(".search-label", { style: searchLabelStyle }, "Query:"),
				renderComboBox({ suggestions, highlighted, selected }),
			]),
			section({ style: sectionStyle }, [
				label(".results-label", "Results:"),
				renderResults({ kept }),
			]),
		]);
	});
}

const BASE_URL =
	"https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=";

const networking = {
	processResponses(JSONP$: Stream<ResponseStream>): Stream<string[]> {
		// This is a case a STFU compiler ... but one of these days I should maybe try to understand why even though ResponseStream extends Stream
		// still: type 'Stream<any>' is not assignable to type 'ResponseStream', should be some covariance bullshit
		return ((JSONP$ as unknown) as Stream<Stream<any>>)
			.filter(
				(res$) => (res$ as ResponseStream).request.indexOf(BASE_URL) === 0
			)
			.flatten()
			.debug()
			.map((res) => res[1]);
	},

	generateRequests(searchQuery$) {
		return searchQuery$.map((q) => BASE_URL + encodeURI(q));
	},
};

function preventedEvents(actions: Actions, state$) {
	return state$
		.map((state) =>
			actions.keepFocusOnInput$.map((event) => {
				if (
					state.get("suggestions").length > 0 &&
					state.get("highlighted") !== null
				) {
					return event;
				} else {
					return null;
				}
			})
		)
		.flatten()
		.filter((ev) => ev !== null);
}

export default function app(sources: Sources) {
	const state$ = sources.state.stream;

	const suggestionsFromResponse$ = networking.processResponses(sources.JSONP);
	const actions = intent(sources.DOM, sources.Time);
	const reducer$ = reducers(suggestionsFromResponse$, actions);
	const vtree$ = view(state$);
	const prevented$ = preventedEvents(actions, state$);
	const searchRequest$ = networking.generateRequests(actions.search$);

	return {
		DOM: vtree$,
		preventDefault: prevented$,
		JSONP: searchRequest$,
		state: xs.merge(
			xs.of<Reducer<any>>(() =>
				ImmutableMap({
					suggestions: [],
					kept: [],
					highlighted: null,
					selected: null,
				})
			),
			reducer$
		),
	};
}
