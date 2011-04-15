// TODO: handle different URL paths for different versions of the page.



function diffNodes() {
	// use this regex to ignore certain CSS properties
	// TODO:
	//  * confirm this list and/or ignore all vendor prefixes?
	//  * make this configurable via the UI;
	var IGNORE_REGEX = /^-(webkit|ms|moz)/;

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
				css_diffs.push(" » " + css_props[j] + " : " + el1_style[css_props[j]] + " vs. " + el2_style[css_props[j]]);
			}
		};

		// display diff result for node if there is any
		if (css_diffs.length > 0) {
			displayDiffResult(doc1_els[i], css_diffs);
		}

		// clear diff list for next node
		css_diffs = [];
	};

};


function displayDiffResult(node, diffs) {
	var node_info = node.nodeName + 
		((node.id != "") ? "#" + node.id : "") + 
		((node.className != "") ? "." + node.className : "");

	var path_info = jQuery(node).parentsUntil('html').map(function () { return this.tagName; }).get().join(" < ");

	console.log(node_info + " < " + path_info + "\n" + diffs.join("\n"));
}


function loadDoc(event) {
	$("#" + event.data.node_id)[0].src = $("#" + event.data.input_id)[0].value;
};


jQuery(document).ready(function($){
	$('#diff-css').click(diffNodes);	

	$('#doc1_load').bind('click', { input_id: 'doc1_url', node_id: 'doc1' }, loadDoc);
	$('#doc2_load').bind('click', { input_id: 'doc2_url', node_id: 'doc2' }, loadDoc);
});
