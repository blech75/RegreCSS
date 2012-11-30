var page = require('webpage').create();
var system = require('system');


if ( system.args.length != 3 ) {
	console.log("Usage: phantomjs " + system.args[0] + " URL_1 URL_2");
//	console.log("system.args.length = " + system.args.length);

	phantom.exit(1);
}

// the URL where the tool lives
var CSSDIFF_BASE_URL = "http://localhost/cssdiff/cssdiff.html";

// read the URLs from the command line
var urls = Array.prototype.slice.call(system.args, 1);
console.log("Attempting to compare the following two URLs:");
console.log(" * " + urls[0]);
console.log(" * " + urls[1]);

// construct the URL to the diff tool, passing in the params to auto-execute on load
var cssdiff_page_url = CSSDIFF_BASE_URL + 
	"?url1=" + encodeURIComponent(urls[0]) + 
	"&url2=" + encodeURIComponent(urls[1]);

// override the default messaging methods of the page to output to the phantomjs console
page.onConsoleMessage = function(msg) { console.log("[page console] " + msg); };
page.onAlert = function(msg) { console.log("[page alert] " + msg); };

// overly verbose logging for hardcore debugging
// page.onResourceRequested = function(req) { console.log("--> resource requested : " + req.url); };
// page.onResourceReceived = function(req) { console.log("onResourceReceived : " + req.url); };

// output a stack trace on error
page.onError = function (msg, trace) {
	console.log("[page error] " + msg);
	trace.forEach(function(item) {
		console.log("[page error] " + '  ', item.file, ':', item.line);
	});
}


// ===========================================================================

/**
 * Wait until the test condition is true or a timeout occurs. Useful for waiting
 * on a server response or for a ui change (fadeIn, etc.) to occur.
 *
 * @param testFx javascript condition that evaluates to a boolean,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param onReady what to do when testFx condition is fulfilled,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param timeOutMillis the max amount of time to wait. If not specified, 3 sec is used.
 */
function waitFor(testFx, onReady, timeOutMillis) {
    var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 3001, //< Default Max Timeout is 3s
        start = new Date().getTime(),
        condition = false,
        interval = setInterval(function() {
            if ( (new Date().getTime() - start < maxtimeOutMillis) && !condition ) {
                // If not time-out yet and condition not yet fulfilled
                condition = (typeof(testFx) === "string" ? eval(testFx) : testFx()); //< defensive code
            } else {
                if(!condition) {
                    // If condition still not fulfilled (timeout but condition is 'false')
                    // console.log("'waitFor()' timeout");
                    console.log("Error: timeout condition never met.");
                    phantom.exit(1);
                } else {
                    // Condition fulfilled (timeout and/or condition is 'true')
                    // console.log("'waitFor()' finished in " + (new Date().getTime() - start) + "ms.");
                    typeof(onReady) === "string" ? eval(onReady) : onReady(); //< Do what it's supposed to do once the condition is fulfilled
                    clearInterval(interval); //< Stop this interval
                }
            }
        }, 100); //< repeat check every 100ms
}

// ===========================================================================


// load the page
page.open(cssdiff_page_url, function(status){
	// bail out if it failed
	if (status !== 'success') {
		console.log('Error: Failed to load page.');
	}

	// run a loop while we wait for CSSDiff to complete
	waitFor(
		// condition to test
		function(){
			// this check will test for the diff finishing
			return page.evaluate(function(){
				return (true && (CSSDiff.diff_completed_at > CSSDiff.last_diff_started_at));
			});
		},

		// what to do onready
		function(){
			// not much to do here right now; just exit
			phantom.exit();
		}
	);

});
