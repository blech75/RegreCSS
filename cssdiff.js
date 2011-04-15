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

	for (var i=0; i < doc1_els.length; i++) {
		// output the node name, id, and class
		var node_info = doc1_els[i].nodeName + ((doc1_els[i].id != "") ? "#" + doc1_els[i].id : "") + ((doc1_els[i].className != "") ? "." + doc1_els[i].className : "");
		var path_info = jQuery(doc1_els[i]).parentsUntil('html').map(function () { return this.tagName; }) .get().join(" < ");
		console.log(node_info + " < " + path_info);

		// get the conputed style for this element
		var el1_style = doc1.contentDocument.defaultView.getComputedStyle(doc1_els[i]);
		var el2_style = doc2.contentDocument.defaultView.getComputedStyle(doc2_els[i]);

		// memoize all of the CSS props on the first iteration
		css_props = css_props || _.toArray(el1_style);

		// iterate over the list of CSS properties
		_.each(css_props, function(prop){
			// bail out if the property matches the ignore regex
			if (IGNORE_REGEX.test(prop)) return;

			// if the value of the property does not match across documents
			if (el1_style[prop] != el2_style[prop]) {
				console.log(" > " + prop + " : " + el1_style[prop] + " vs. " + el2_style[prop]);
			}
		});
		
	};

};

function loadDoc(event) {
	// FIXME: this jQuery thing seems to be a lot of work. i must be doing something wrong.
	$("#" + event.data.node_id)[0].src = $("#" + event.data.input_id)[0].value;
};


jQuery(document).ready(function($){
	$('#diff-css').click(diffNodes);	

	$('#doc1_load').bind('click', { input_id: 'doc1_url', node_id: 'doc1' }, loadDoc);
	$('#doc2_load').bind('click', { input_id: 'doc2_url', node_id: 'doc2' }, loadDoc);
});
