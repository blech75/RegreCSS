// KNOWN ISSUE: the computed style is determined when the user clicks 
// 'Run CSS Diff', which may confusingly report properties of elements which 
// are animated automatically (on page load) as being different. maybe we 
// should allow users to specify selectors to ignore and/or the properties to 
// ignore. need to think about this.

// TODO: make this more interactive when run in the browser. output a dynamic 
// report that the user can interact with, highlighting elements that differ, 
// etc.

// ---------------------------------------------------------------------------

// helper function to build up a representaton of the node name + class/ID
// FIXME: i assume this breaks with multiple classes. needs testing
function generateNodeSignature(n) {
	return n.nodeName + 
		((n.id != "") ? "#" + n.id : "") + 
		((n.className != "") ? "." + n.className : "");
}

// helper function to return the path to the node (from <html> on down).
function getNodeAncestors(n) {
	return jQuery(n).parentsUntil('html').map(function() { 
		return generateNodeSignature(this); 
	}).get().reverse().join(" > ");
}


var CSSDiffResult = function(doc1_node, doc2_node, diffs) {
	this.node = doc1_node;
	this.node_doc2 = doc2_node;
	this.diffs = diffs;	
};

// allow this to be easily printed out in the console (plain text)
CSSDiffResult.prototype.toString = function(){
	var node_info = generateNodeSignature(this.node);
	var path_info = getNodeAncestors(this.node);

	return [
		path_info + " > " + node_info,
		this.diffs.length + " property differences:",
		this.diffs.join("\n")
	].join("\n");
};

// slightly richer formatting than toString.
// intended for outputting into the DOM for an interactive UI, though i 
// suppose it could be used for generating a static report, too.
CSSDiffResult.prototype.toHTML = function(){
	var node_info = generateNodeSignature(this.node);
	var path_info = getNodeAncestors(this.node);

	// generate the markup for the node and its property diffs
	return [
		"<h3>" + path_info + " > " + node_info + "<\/h3>",
		"<p>" + this.diffs.length + " property differences:" + "<\/p>",
		"<ul>",
		_.map(this.diffs, function(d) { return d.toHTML(); }).join("\n"),
		"</ul>"
	].join("\n");
};


var CSSPropertyDiffResult = function(prop, doc1_value, doc2_value) {
	this.prop = prop;
	this.doc1_value = doc1_value;
	this.doc2_value = doc2_value;
};

// allow this to be easily printed out in the console (plain text)
CSSPropertyDiffResult.prototype.toString = function() {
	return " » " + this.prop + 
		" : " + this.doc1_value + 
		" vs. " + this.doc2_value;
};

// slightly richer formatting than toString.
// intended for outputting into the DOM for an interactive UI, though i 
// suppose it could be used for generating a static report, too.
CSSPropertyDiffResult.prototype.toHTML = function() {
	return "<li>" +
		this.prop + 
		" : " + this.doc1_value + 
		" vs. " + this.doc2_value +
		"<\/li>";
};


var CSSDocumentDiffResult = function(node_diffs, node_tally_skipped) {
	this.node_diffs = node_diffs;
	this.skipped = node_tally_skipped;

	this.elapsed_time = null;
};


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
	//   * diffDocuments() starts
	// 
	// stores timestamps of when these events happened. allows us to determine 
	// if diffDocuments() should auto-run or not.
	last_diff_started_at : null,
	doc1_loaded_at : null,
	doc2_loaded_at : null,
	diff_completed_at : null,
	
	// stores the results, allowing us to access them from outside the object
	results : null,

	// store the currently clicked element in the output container
	clicked_element : null,

	// use this regex to ignore certain CSS properties
	// TODO:
	//  * confirm this list and/or ignore all vendor prefixes?
	//  * make this configurable via the UI;
	IGNORE_REGEX : /^-(webkit|ms|moz|o)/,
	URL_REGEX : /url\([^)]+\)/,

	// the DOM node which contains the output of the diff engine
	output_el : null,

	// set up the prerequsites
	init : function () {
		// grab the DOM node references so we don't need to get them each run. 
		// (these stay constant across diff runs.)
		this.doc1 = document.getElementById('doc1');
		this.doc2 = document.getElementById('doc2');

		this.output_el = document.getElementById('output-container');
	},

	// executes diff
	run : function() {
		this.diffDocuments();
		this.updateURLBar();
	},

	// updates the browser's URL bar so that you can bookmark the diff
	updateURLBar : function() {
		// placeholder; for future use by popstate.
		var state_obj = {
			doc1_url : this.doc1.src,
			doc2_url : this.doc2.src
		};

		// generate the new URL. this should match the URL we parse on load of 
		// the page. (see loadDocsFromQueryString)
		var new_url = window.location.pathname + 
			"?" + "url1=" + encodeURIComponent(this.doc1.src) + 
			"&" + "url2=" + encodeURIComponent(this.doc2.src);

		// push the state
		history.pushState(state_obj, '', new_url);
	},

	// diffDocuments optionally takes two arguments, which are IFRAME node 
	// references. otherwise, looks at doc1 and doc2 properties.
	diffDocuments : function (doc1_passed, doc2_passed) {
		// allow docs to be passed in, for separation
		var doc1 = doc1_passed || this.doc1;
		var doc2 = doc2_passed || this.doc2;

		// benchmarking
		var TIME_START = new Date();

		// pull out the URLs of the documents for later use
		this.doc1_url = doc1.src;
		this.doc2_url = doc2.src;

		// a bit of a sanity check here. let's just deal with IFRAMEs for now, 
		// mmmmmkay?
		if ( !(_.contains([doc1.tagName.toLowerCase(), doc2.tagName.toLowerCase()], 'iframe')) ) {
			console.log('ERROR: nodes must both be IFRAMEs.')
			return;
		}

		// grab all of the elements in the IFRAME's DOM
		// 
		// NOTE: this really needs to be handled differently, traversing the nodes 
		// more intelligently (in a tree) rather than a flattened list of the DOM 
		// nodes. that will allow us to more sensibly compare documents trees that 
		// are not entirely identical.
		var doc1_els = _.toArray(doc1.contentDocument.body.getElementsByTagName('*'));
		var doc2_els = _.toArray(doc2.contentDocument.body.getElementsByTagName('*'));

		// check to see if both documents are equal, tag-/DOM-wise
		if (doc1_els.length !== doc2_els.length) {
			console.log("WARNING: DOM trees differ between documents! (doc1: " + doc1_els.length + ", doc2: " + doc2_els.length + ") Proceed with caution.");
		}

		// do the dirty work
		this.results = this.diffNodes(doc1, doc1_els, doc2, doc2_els);

		// benchmarking
		var TIME_END = new Date();

		// store the elapsed time on the results object for reporting
		this.results.elapsed_time = TIME_END - TIME_START;

		// signal we're done so phantomjs can exit cleanly
		this.diff_completed_at = TIME_END;

		// set the last diff's start time to null so we don't trigger a re-diff 
		// on load of the next doc.
		this.last_diff_started_at = null;

		// show how we did
		this.displayDiffResults();
	},

	// takes an two arrays of nodes and compares them
	diffNodes : function(doc1, doc1_els, doc2, doc2_els) {
		// holds a list of all the CSS properties
		var css_props = null;

		var node_diffs = [];

		// holds a list of the CSS props that are different for each node; cleared on each iteration
		var prop_diffs = [];

		// some rudimwntary counters that store data for summary later.
		var node_tally_skipped = 0;

		// loop over all of the elements in the first doc (and hope they're the same in the second doc!)
		for (var i=0; i < doc1_els.length; i++) {
			// check to see if we're comparing apples to apples, or even if the second apple exists!
			if (doc1_els[i] && !doc2_els[i]) {
				console.log("ERROR: DOM node from doc1 (" + doc1_els[i].tagName + ") does not exist in doc2. Ignoring.");
				node_tally_skipped++;
				continue;
			}

			// get the conputed style for this element
			// TODO: what about pseudo-classes? (:hover, etc.)
			var el1_style = doc1.contentDocument.defaultView.getComputedStyle(doc1_els[i]);
			var el2_style = doc2.contentDocument.defaultView.getComputedStyle(doc2_els[i]);

			// memoize all of the CSS props on the first iteration
			css_props = css_props || _.toArray(el1_style);

			// iterate over the list of CSS properties
			for (var j=0; j < css_props.length; j++) {
				// bail out if the property matches the ignore regex
				if (this.IGNORE_REGEX.test(css_props[j])) { continue; }

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
					if (this.URL_REGEX.test(el1_style[css_props[j]])) {
						var common_path_parts = this.determineCommonPathParts(this.doc1_url, this.doc2_url);
						var revised_prop1 = el1_style[css_props[j]].split(common_path_parts[0]).join("");
						var revised_prop2 = el2_style[css_props[j]].split(common_path_parts[1]).join("");
						if (revised_prop1 == revised_prop2) { continue; }
					}

					prop_diffs.push(new CSSPropertyDiffResult(
						css_props[j],
						el1_style[css_props[j]],
						el2_style[css_props[j]]
					));
				}

			} // END: for loop over CSS props

			// if there are any property diffs on this node, add them to the node diffs
			if (prop_diffs.length > 0) {
				node_diffs.push(new CSSDiffResult(doc1_els[i], doc2_els[i], prop_diffs));
			}

			// clear diff list for next node
			prop_diffs = [];
		}

		return new CSSDocumentDiffResult(node_diffs, node_tally_skipped);
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

		}

	},

	// loads URL into IFRAME. takes two args: URL of the doc to load, and the 
	// IFRAME doc reference (a node) to load it into.
	loadDoc : function(url, iframe_el) {
		iframe_el.src = url;
	},

	// output the diff for a node. takes two args: the node, and an array of the 
	// reported differences (as strings).
	displayNodeDiffResult : function(node_diff) {
		// TODO: make this conditional so it only outputs when running under phantomjs
		console.log(node_diff.toString());

		return node_diff.toHTML();
	},

  // displays the diff results by updating the document
	displayDiffResults : function() {
		// save some typing
		var results = this.results;

		// console.log everything for right now
		console.log("CSS Diff completed in " + results.elapsed_time + "ms. " + results.node_diffs.length + " node(s) differ, " + results.skipped + " node(s) skipped.");

		// iterate over node_diffs, generating the HTML for each
		var results_html = _.map(results.node_diffs, function(r, index) {
			// the 'data-diff-index' attr allows us to associate the displayed diff 
			// to the appropriate nodes in the source documents because it's the index of the 
			return [
				'<div class="node-diff" data-diff-index="' + index + '">',
				this.displayNodeDiffResult(r),
				'</div>'
			].join("\n");
		}, this).join("\n");

		// shove it into the doc
		$(this.output_el).html(results_html);
	},

	// utlility function that returns an array with two items: strings that 
	// represent the URL "base" of the docs. takes two URLs (filenames right now).
	// TODO: rip this out of the CSSDiff object
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

	// run the init script
	CSSDiff.init();

	// TODO: move these event handlers on to the CSSDiff object. need to figure 
	// out how function binding works w/ jQuery. (I'm used to Prototype's 
	// .bind() method )

	// event handler intended to be bound to the "load document" button. takes
	// one argument: a DOM event.
	function loadDocClickHandler(event) {
		CSSDiff.loadDoc(
		  document.getElementById(event.data.node_id + "_url").value, 
		  document.getElementById(event.data.node_id)
		);
	}


	// event handler intended to be called onload of the IFRAME, which allows us 
	// to determine if we should run diffDocuments() (for automatic execution when 
	// initiated via query string).
	function iframeLoadHandler(event) {
		CSSDiff[event.srcElement.id + '_loaded_at'] = new Date();
	//	console.log('IFRAME ' + event.srcElement.id + ' loaded at ' + CSSDiff[event.srcElement.id + '_loaded']);

		// check to see if we can run diffDocuments()
		if ( CSSDiff.last_diff_started_at && 
				(CSSDiff.doc1_loaded_at > CSSDiff.last_diff_started_at) && 
				(CSSDiff.doc2_loaded_at > CSSDiff.last_diff_started_at)
		) {
			// console.log("both docs loaded; executing CSSDiff.run() now");
			CSSDiff.run();

		} else {
      console.log("both docs not loaded yet; holding off on diffDocuments()");
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
		CSSDiff.run();
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -


	// attach event handler to IFRAMEs so we know when they're loaded. this 
	// allows us to auto-execute diffDocuments() when URLs are passed in via query 
	// params.
	$('.embedded-doc').bind('load', iframeLoadHandler);

	// attach event handler to the "Run Diff CSS" button.
	$('#diff-css').bind('click', diffCssClickHandler);

	// attach event to the 'load document' buttons. same event handler, 
	// different event data.
	$('#doc1_load').bind('click', { node_id: 'doc1' }, loadDocClickHandler);
	$('#doc2_load').bind('click', { node_id: 'doc2' }, loadDocClickHandler);


	// =========================================================================

	function highlightNode(node, css_prop, css_value) {
		// scroll the node into view so the user can see it
		node.scrollIntoView();

		// store the old CSS value so we can return it to normal later
		node.old_css_value = $(node).css(css_prop);

		// highlight the node in some meaningful way
		$(node).css(css_prop, css_value);
	}

	function unhighlightNode(node, css_prop) {
		// return the css_prop of the node back to its original value (pre-highlight)
		$(node).css(css_prop, node.old_css_value);
	}


	function getDiff(element) {
		// get the actual diff result obj based on which .node-diff we're hovering over
		// REVIEWME: this may need to be refactored. not sure i love the ref to CSSDiff here. *shrug*
		return CSSDiff.results.node_diffs[$(element).data("diff-index")];
	}

	function diffItemClickHandler(e) {
		// FIXME: ideally we wouldn't hardcode the css prop/value here. using 
		// outline right now as it's not commonly used; likely needs to change, 
		var css_prop = "outline";
		var css_value = "1px solid red";
		
		// get the diff for the clicked node
		var diff = getDiff(this);

		// clicked an element when no others are highlighted
		if (CSSDiff.clicked_element === null) {
			// record that we clicked the node
			CSSDiff.clicked_element = e.currentTarget;

			// highlight the node
			highlightNode(e.currentTarget, css_prop, css_value);
			highlightNode(diff.node,       css_prop, css_value);
			highlightNode(diff.node_doc2,  css_prop, css_value);

		// clicked an element that we clicked before (this time, to unhighlight it)
		} else if (CSSDiff.clicked_element == e.currentTarget) {
			// unhighlight the node
			unhighlightNode(e.currentTarget, css_prop);
			unhighlightNode(diff.node,       css_prop);
			unhighlightNode(diff.node_doc2,  css_prop);

			// reset the clicked_element property
			CSSDiff.clicked_element = null;

		// clicked some other element
		} else {
			// grab the data about the old node
			var old = CSSDiff.clicked_element;
			var old_diff = getDiff(old);
			
			// unhighlight the old node
			unhighlightNode(CSSDiff.clicked_element, css_prop);
			unhighlightNode(old_diff.node,           css_prop);
			unhighlightNode(old_diff.node_doc2,      css_prop);
                                               
			// record that we clicked the node
			CSSDiff.clicked_element = e.currentTarget;

			// highlight the node
			highlightNode(CSSDiff.clicked_element, css_prop, css_value);
			highlightNode(diff.node,               css_prop, css_value);
			highlightNode(diff.node_doc2,          css_prop, css_value);
		}

		// console.log("CSSDiff.clicked_element = " + $(CSSDiff.clicked_element).data('diff-index'));
	}

	function diffItemHighlightHandler(e) {
		// FIXME: ideally we wouldn't hardcode the css prop/value here. using 
		// outline right now as it's not commonly used; likely needs to change, 
		var css_prop  = "outline";
		var css_value = "1px solid orange";

		// bailing if the currenly highlighted element is the one we're hovering 
		// over. we don't want to apply multiple styles to the element (yet).
		if (
			(e.currentTarget === CSSDiff.clicked_element) || 
			($(e.currentTarget).css(css_prop) === css_value) 
		) {
			console.log($(e.currentTarget).css(css_prop));
			return;
		}
		

		// get the diff for the hovered node
		var diff = getDiff(this);

		if ( (e.type === "mouseleave") ) {
			unhighlightNode(diff.node,      css_prop);
			unhighlightNode(diff.node_doc2, css_prop);

		} else if (e.type === "mouseenter") {
			highlightNode(diff.node,      css_prop, css_value);
			highlightNode(diff.node_doc2, css_prop, css_value);

		} else {
			console.log("something else is going on...");
		}

	}

	// delegate the mouseover/out events for the .node-diffs to 
	// #output-container. wouldn't want to manage all the individual events 
	// handlers for each of the .node-diffs
	$("#output-container").delegate(".node-diff", "mouseenter", { }, diffItemHighlightHandler);
	$("#output-container").delegate(".node-diff", "mouseleave", { }, diffItemHighlightHandler);
	// $("#output-container").delegate(".node-diff", "click",     { }, diffItemClickHandler);


	// =========================================================================


	// attempt to parse query params to allow (initial) use programmatically 
	// via phantomjs.
	// 
	// TODO: figure out how to keep the page/environment up and run multiple 
	// diffs.
	CSSDiff.loadDocsFromQueryString(window.location.search);

});
