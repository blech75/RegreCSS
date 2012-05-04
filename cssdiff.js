// KNOWN ISSUE: the computed style is determined when the user clicks 
// 'Run CSS Diff', which may confusingly report properties of elements which 
// are animated automatically (on page load) as being different. maybe we 
// should allow users to specify selectors to ignore and/or the properties to 
// ignore. need to think about this.

// TODO: make this more interactive when run in the browser. output a dynamic 
// report that the user can interact with, highlighting elements that differ, 
// etc.

// TODO: add pushState support that will update the browser URL when you run 
// the diff, allowing you to copy/paste the URL around.


var CSSDiff = {
	// refs to the IFRAMEs that hold the documents to compare
	doc1 : null,
	doc2 : null,

	// The Crazy Way That Dates Are Used So That We Can Run In An Automated Fashion:
	//   * page loads with query params passed
	//   * last_diff_started_at is set to current time
	//   * loadDoc(doc1) called
	//   * loadDoc(doc2) called
	//   * doc2 IFRAME finishes loading; doc2_loaded_at set to current time
	//   * iframeLoadHandler checks to see if both doc[12]_loaded > last_diff_started_at (it's not)
	//   * doc1 IFRAME finishes loading; doc1_loaded_at set to current time
	//   * iframeLoadHandler checks to see if both doc[12]_loaded > last_diff_started_at (it is)
	//   * diffDocumentNodes() starts
	// 
	// stores timestamps of when these events happened. allows us to determine 
	// if diffDocumentNodes() should auto-run or not.
	last_diff_started_at : null,
	doc1_loaded_at : null,
	doc2_loaded_at : null,
	diff_completed_at : null,

	// diffDocumentNodes takes two arguments, which are IFRAME node references
	diffDocumentNodes : function (doc1, doc2) {
		var TIME_START = new Date();

		// use this regex to ignore certain CSS properties
		// TODO:
		//  * confirm this list and/or ignore all vendor prefixes?
		//  * make this configurable via the UI;
		var IGNORE_REGEX = /^-(webkit|ms|moz|o)/;
		var URL_REGEX = /url\([^)]+\)/;

		// pull out the URLs of the documents for later use
		var doc1_url = doc1.baseURI;
		var doc2_url = doc2.baseURI;

		// a bit of a sanity check here. let's just deal with IFRAMEs for now, 
		// mmmmmkay?
		if ( !(_.contains([doc1.tagName.toLowerCase(), doc2.tagName.toLowerCase()], 'iframe')) ) {
			console.log('ERROR: nodes must both be IFRAMEs.')
			return;
		}

		// some rudimwntary counters that store data for summary later.
		var node_tally = 0;
		var node_tally_skipped = 0;

		// grab all of the elements in the IFRAME's DOM
		var doc1_els = _.toArray(doc1.contentDocument.body.getElementsByTagName('*'));
		var doc2_els = _.toArray(doc2.contentDocument.body.getElementsByTagName('*'));

		// check to see if both documents are equal, tag-/DOM-wise
		if (doc1_els.length !== doc2_els.length) {
			console.log("WARNING: DOM trees differ between documents! (doc1: " + doc1_els.length + ", doc2: " + doc2_els.length + ") Proceed with caution.");
		}

		// holds a list of all the CSS properties
		var css_props = null;

		// holds a list of the CSS props that are different for each node; cleared on each iteration
		var css_diffs = [];

		// loop over all of the elements in the first doc (and hope they're the same in the second doc!)
		for (var i=0; i < doc1_els.length; i++) {
			// check to see if we're comparing apples to apples, or even if the second apple exists!
			if (doc1_els[i] && !doc2_els[i]) {
				console.log("ERROR: DOM node from doc1 (" + doc1_els[i].tagName + ") does not exist in doc2. Ignoring.");
				node_tally_skipped++;
				continue;
			}

			// get the conputed style for this element
			// TODO: what about :hover states, etc.? (the term escapes me at the moment)
			var el1_style = doc1.contentDocument.defaultView.getComputedStyle(doc1_els[i]);
			var el2_style = doc2.contentDocument.defaultView.getComputedStyle(doc2_els[i]);

			// memoize all of the CSS props on the first iteration
			css_props = css_props || _.toArray(el1_style);

			// iterate over the list of CSS properties
			for (var j=0; j < css_props.length; j++) {
				// bail out if the property matches the ignore regex
				if (IGNORE_REGEX.test(css_props[j])) { continue; };

				// if the value of the property does not match across documents
				if (el1_style[css_props[j]] != el2_style[css_props[j]]) {

					// before comparing, pre-process values containing "url()" to remove 
					// the common parts of the URL. kinda ugly, but works. example:
					//
					//   url(http://localhost/client/version1/img/logo.gif)
					//   url(http://localhost/client/version2a/img/logo.gif)
					// 
					// you'd be left with the following for comparison:
					// 
					//   url(img/logo.gif)
					// 
					if (URL_REGEX.test(el1_style[css_props[j]])) {
						var common_path_parts = determineCommonPathParts(doc1_url, doc2_url);
						var revised_prop1 = el1_style[css_props[j]].split(common_path_parts[0]).join("");
						var revised_prop2 = el2_style[css_props[j]].split(common_path_parts[1]).join("");
						if (revised_prop1 == revised_prop2) { continue; }
					}

					// log the diff
					css_diffs.push(
						" » " + css_props[j] + 
						" : " + el1_style[css_props[j]] + 
						" vs. " + el2_style[css_props[j]]
					);

					// increment the # of nodes that differ, for reporting later
					node_tally++;
				}

			}; // END: for loop over CSS props

			// display diff result for node if there is any
			if (css_diffs.length > 0) {
				this.displayNodeDiffResult(doc1_els[i], css_diffs);
			}

			// clear diff list for next node
			css_diffs = [];
		};

		var TIME_END = new Date();

		console.log("CSS Diff completed in " + (TIME_END - TIME_START) + "ms. " + node_tally + " node(s) differ, " + node_tally_skipped + " node(s) skipped.");

		// signal we're done so phantomjs can exit cleanly
		this.diff_completed_at = new Date();
		
		// set the last diff's start time to null so we don't trigger a re-diff 
		// on load of the next doc.
		this.last_diff_started_at = null;
	},

	// allow for URLs to be passed in via query string, which allows for 
	// automatic loading and running of the diff once URLs load. takes one 
	// argument, a query string (presumably from window.location.search).
	loadDocsFromQueryString : function(query_string) {
		// bail if the query string is missing, or just contains "?"
		if (query_string.length <= 1) { return; }

		// remove the ? and turn into an array in one fell swoop
		var query_params = query_string.substring(1).split("&");

		// make sure there's an actual query string to parse
		if (query_params.length >= 1 && query_params[0] != "") {
			var doc1, doc2, url1, url2, kv_pair;

			// this may seem stupid, but it's less code and less looping.
			for (var i = 0; i < query_params.length; i++) {
				kv_pair = query_params[i].split("=");

				// sanity check
				if ( (kv_pair.length != 2) || (kv_pair[1] && (kv_pair[1] == "")) ) {
					console.log("confused parsing query param " + i + ": " + kv_pair.join());
					continue;
				}

				// set vars based on query string
				if ( !url1 && (kv_pair[0] == 'url1') ) {
					url1 = decodeURIComponent(kv_pair[1]);
				} else if ( !url2 && (kv_pair[0] == 'url2')  ) {
					url2 = decodeURIComponent(kv_pair[1]);
				} else {
					// unexpected key/value pair; log it.
					console.log(kv_pair[0], kv_pair[1]);
				}

				// break out of loop early if we have both URL. this means if url1 is 
				// repeated twice in the query string, we just use the first instance
				if (url1 && url2) { break; }
			}

			this.last_diff_started_at = new Date();

			// update the UI and load the URLs into the IFRAMEs
			// NOTE: we're not validating URLs beyond string length; not worth it.
			if (url1 && url1.length > 0) {
				document.getElementById("doc1_url").value = url1;
				// console.log("Loading URL1: " + url1);
				this.loadDoc(url1, this.doc1);
			}
			if (url2 && url2.length > 0) {
				document.getElementById("doc2_url").value = url2;
				// console.log("Loading URL2: " + url2);
				this.loadDoc(url2, this.doc2);
			}

		};		

	},

	// loads URL into IFRAME. takes two args: URL of the doc to load, and the 
	// IFRAME doc reference (a node) to load it into.
	loadDoc : function(url, iframe_el) {
		iframe_el.src = url;
	},

	// output the diff for a node. takes two args: the node, and an array of the 
	// reported differences (as strings).
	displayNodeDiffResult : function(node, diffs) {
		var node_info = node.nodeName + 
			((node.id != "") ? "#" + node.id : "") + 
			((node.className != "") ? "." + node.className : "");

		var path_info = jQuery(node).parentsUntil('html').map(function() { 
			return this.tagName; 
		}).get().join(" < ");

		console.log(node_info + " < " + path_info + "\n" + diffs.join("\n"));
	},

	// utlility function that returns an array with two items: strings that 
	// represent the URL "base" of the docs. takes two URLs (filenames right now).
	determineCommonPathParts : function (path1, path2) {
		var path1_parts = path1.split("/");
		var path2_parts = path2.split("/");

		// iterate over the two arrays and compare the elements, breaking where 
		// they don't match anymore. on exit, 'i' will be the index that doesn't 
		// match.
		var i=2; // ignore the "http://" bit
		for (; i < path1_parts.length; i++) {
			if (path1_parts[i] == path2_parts[i]) { continue; }
			else { break; }
		}

		// FIXME: this popping assumes the last path part is a filename
		path1_parts.pop();
		path2_parts.pop();

		return [
			path1.substring(0, (path1.indexOf(path1_parts[i]) + path1_parts[i].length + 1)), 
			path2.substring(0, (path2.indexOf(path2_parts[i]) + path2_parts[i].length + 1))
		];
	}

};


// ---------------------------------------------------------------------------


// standard DOM ready event handler.
jQuery(document).ready(function($){

	// TODO: move these event handlers on to the CSSDiff object. need to figure 
	// out how function binding works w/ jQuery. (I'm used to Prototype's 
	// .bind() method )

	// event handler intended to be bound to the "load document" button. takes
	// one argument: a DOM event.
	function loadDocClickHandler(event) {
		CSSDiff.loadDoc(document.getElementById(event.data.node_id + "_url").value, document.getElementById(event.data.node_id));
	}


	// event handler intended to be called onload of the IFRAME, which allows us 
	// to determine if we should run diffDocumentNodes() (for automatic execution when 
	// initiated via query string).
	function iframeLoadHandler(event) {
		CSSDiff[event.srcElement.id + '_loaded_at'] = new Date();
	//	console.log('IFRAME ' + event.srcElement.id + ' loaded at ' + CSSDiff[event.srcElement.id + '_loaded']);

		// check to see if we can run diffDocumentNodes()
		if ( CSSDiff.last_diff_started_at && 
				(CSSDiff.doc1_loaded_at > CSSDiff.last_diff_started_at) && 
				(CSSDiff.doc2_loaded_at > CSSDiff.last_diff_started_at)
		) {
			// console.log("both docs loaded; running diffDocumentNodes() now");
			CSSDiff.diffDocumentNodes(CSSDiff.doc1, CSSDiff.doc2);

		} else {
			// console.log("both docs not loaded yet; holding off on diffDocumentNodes()");
		}
	}


	// event handler intended to be called when the "run css diff" button is 
	// clicked.
	function diffCssClickHandler(event){
		// record when we click the button so we can make better decisions (read: 
		// automate) things later.
		CSSDiff.last_diff_started_at = new Date();

		// TODO: how do we determine if both documents are ready to be checked? 
		// (e.g. loaded w/o errors)
		CSSDiff.diffDocumentNodes(CSSDiff.doc1, CSSDiff.doc2);
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	// grab the DOM nodes so we don't need to get them each time. these should 
	// stay constant for the entire scope of our work.
	CSSDiff.doc1 = document.getElementById('doc1');
	CSSDiff.doc2 = document.getElementById('doc2');

	// attach event handler to IFRAMEs so we know when they're loaded. this 
	// allows us to auto-execute diffDocumentNodes() when URLs are passed in via query 
	// params.
	$('.embedded-doc').bind('load', iframeLoadHandler);

	// attach event handler to the "Run Diff CSS" button.
	$('#diff-css').bind('click', diffCssClickHandler);

	// attach event to the 'load document' buttons. same event handler, 
	// different event data.
	$('#doc1_load').bind('click', { node_id: 'doc1' }, loadDocClickHandler);
	$('#doc2_load').bind('click', { node_id: 'doc2' }, loadDocClickHandler);

	// attempt to parse query params to allow (initial) use programmatically 
	// via phantomjs.
	// 
	// TODO: figure out how to keep the page/environment up and run multiple 
	// diffs.
	CSSDiff.loadDocsFromQueryString(window.location.search);

});
