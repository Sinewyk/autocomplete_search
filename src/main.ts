import xs, { Stream } from "xstream";
import { run } from "@cycle/run";
import { makeDOMDriver } from "@cycle/dom";
import { makeJSONPDriver } from "@cycle/JSONP";
import { timeDriver } from "@cycle/time";
import { withState } from "@cycle/state";
import app from "./app";

function preventDefaultSinkDriver(prevented$: Stream<any>) {
	prevented$.addListener({
		next: (ev) => {
			ev.preventDefault();
			if (ev.type === "blur") {
				ev.target.focus();
			}
		},
		error: () => {},
		complete: () => {},
	});
	return xs.empty();
}

const wrappedMain = withState(app);

run(wrappedMain, {
	DOM: makeDOMDriver("#main-container"),
	JSONP: makeJSONPDriver(),
	preventDefault: preventDefaultSinkDriver,
	Time: timeDriver,
});
