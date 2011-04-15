// TODO: handle different URL paths for different versions of the page.


function diffNodes(event) {
	// use this regex to ignore certain CSS properties
	// TODO:
	//  * confirm this list and/or ignore all vendor prefixes?
	//  * make this configurable via the UI;
	var IGNORE_REGEX = /^-(webkit|ms|moz)/;
	var URL_REGEX = /url\([^)]+\)/;

	var doc1_url = $("#" + event.data.inputs[0])[0].value;
	var doc2_url = $("#" + event.data.inputs[1])[0].value;

	// grab the IFRAME IDs
	var doc1 = document.getElementById('doc1');
	var doc2 = document.getElementById('doc2');

	// grab all of the elements in the IFRAME's DOM
	var doc1_els = _.toArray(doc1.contentDocument.body.getElementsByTagName('*'));
	var doc2_els = _.toArray(doc2.contentDocument.body.getElementsByTagName('*'));

	// holds a list of all the CSS properties
	var css_props = null;
	
	// holds a list of the CSS props that are different for each node; cleared on each iteration
	var css_diffs = [];

	// loop over all of the elements in the first doc (and hope they're the same in the second doc!)
	for (var i=0; i < doc1_els.length; i++) {
		// get the conputed style for this element
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
				// the common parts of the URL
				if (URL_REGEX.test(el1_style[css_props[j]])) {
					var common_path_parts = returnCommonPathPart(doc1_url, doc2_url);
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
			}

		}; // END: for loop over CSS props

		// display diff result for node if there is any
		if (css_diffs.length > 0) {
			displayDiffResult(doc1_els[i], css_diffs);
		}

		// clear diff list for next node
		css_diffs = [];
	};

};


function returnCommonPathPart(path1, path2) {
	var path1_parts = path1.split("/");
	var path2_parts = path2.split("/");

	// iterate over the two arrays and compare the elements, breaking where 
	// they don't match anymore. on exit, 'i' will be the index that doesn't match.
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
};


function displayDiffResult(node, diffs) {
	var node_info = node.nodeName + 
		((node.id != "") ? "#" + node.id : "") + 
		((node.className != "") ? "." + node.className : "");

	var path_info = jQuery(node).parentsUntil('html').map(function () { return this.tagName; }).get().join(" < ");

	console.log(node_info + " < " + path_info + "\n" + diffs.join("\n"));
};


function loadDoc(event) {
	$("#" + event.data.node_id)[0].src = $("#" + event.data.input_id)[0].value;
};


jQuery(document).ready(function($){
	$('#diff-css').bind('click', { inputs: ['doc1_url', 'doc2_url'] }, diffNodes);

	$('#doc1_load').bind('click', { input_id: 'doc1_url', node_id: 'doc1' }, loadDoc);
	$('#doc2_load').bind('click', { input_id: 'doc2_url', node_id: 'doc2' }, loadDoc);
});
